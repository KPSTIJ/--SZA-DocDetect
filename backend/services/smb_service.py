import uuid
import logging

logger = logging.getLogger(__name__)


def _connect(settings):
    from smbprotocol.connection import Connection
    from smbprotocol.session import Session
    from smbprotocol.tree import TreeConnect
    from smbprotocol.open import ImpersonationLevel

    conn = Connection(uuid.uuid4(), settings.SMB_HOST, settings.SMB_PORT)
    conn.connect()
    session = Session(conn, settings.SMB_USERNAME, settings.SMB_PASSWORD)
    session.connect()
    share_path = f"\\\\{settings.SMB_HOST}\\{settings.SMB_SHARE}"
    tree = TreeConnect(session, share_path)
    tree.connect()
    imp = ImpersonationLevel.Impersonation
    return conn, session, tree, imp


def _disconnect(conn, session, tree):
    for obj in (tree, session, conn):
        try:
            obj.disconnect()
        except Exception:
            pass


def _validate_path(rel_path: str) -> str:
    if not rel_path:
        return ""
    normalized = rel_path.replace("\\", "/").strip("/")
    parts = normalized.split("/")
    for p in parts:
        if p in ("..", "."):
            raise ValueError("Path traversal not allowed")
    return normalized


def _ensure_dir(tree, imp, path: str) -> None:
    from smbprotocol.open import (
        Open, FilePipePrinterAccessMask, FileAttributes,
        CreateDisposition, ShareAccess,
    )
    try:
        d = Open(tree, path)
        d.create(imp, FilePipePrinterAccessMask.GENERIC_READ, FileAttributes.FILE_ATTRIBUTE_DIRECTORY,
                 ShareAccess.FILE_SHARE_READ, CreateDisposition.FILE_OPEN, 0)
        d.close()
    except Exception:
        d = Open(tree, path)
        d.create(imp, FilePipePrinterAccessMask.GENERIC_WRITE, FileAttributes.FILE_ATTRIBUTE_DIRECTORY,
                 ShareAccess.FILE_SHARE_WRITE, CreateDisposition.FILE_CREATE, 1)
        d.close()


def _list_dir_entries(tree, imp, dir_path: str) -> list[dict]:
    from smbprotocol.open import (
        Open, FilePipePrinterAccessMask, FileAttributes,
        CreateDisposition, ShareAccess, FileInformationClass,
    )
    entries = []
    try:
        d = Open(tree, dir_path)
        d.create(imp, FilePipePrinterAccessMask.GENERIC_READ, FileAttributes.FILE_ATTRIBUTE_DIRECTORY,
                 ShareAccess.FILE_SHARE_READ, CreateDisposition.FILE_OPEN, 0)
    except Exception:
        return entries
    try:
        files = d.query_directory("*", FileInformationClass.FILE_DIRECTORY_INFORMATION)
        for f in files:
            try:
                name_field = f['file_name']
                raw = name_field.get_value() if hasattr(name_field, 'get_value') else bytes(name_field)
                name = raw.decode('utf-16-le').rstrip('\x00')
            except Exception:
                continue
            if name and name not in ('.', '..'):
                entries.append({"name": name, "type": "folder"})
    except Exception:
        pass
    finally:
        d.close()
    entries.sort(key=lambda x: x["name"].lower())
    return entries


def list_folders(settings, rel_path: str) -> list[dict]:
    conn, session, tree, imp = _connect(settings)
    try:
        normalized = _validate_path(rel_path)
        target = f"{settings.SMB_ROOT}/{normalized}" if normalized else settings.SMB_ROOT
        return _list_dir_entries(tree, imp, target)
    finally:
        _disconnect(conn, session, tree)


def create_folder(settings, rel_path: str, name: str) -> dict:
    from smbprotocol.open import (
        Open, FilePipePrinterAccessMask, FileAttributes,
        CreateDisposition, ShareAccess,
    )
    if not name or "/" in name or "\\" in name:
        raise ValueError("Invalid folder name")

    conn, session, tree, imp = _connect(settings)
    try:
        normalized = _validate_path(rel_path)
        parent = f"{settings.SMB_ROOT}/{normalized}" if normalized else settings.SMB_ROOT
        _ensure_dir(tree, imp, parent)
        new_path = f"{parent}/{name}"
        f = Open(tree, new_path)
        f.create(imp, FilePipePrinterAccessMask.GENERIC_WRITE, FileAttributes.FILE_ATTRIBUTE_DIRECTORY,
                 ShareAccess.FILE_SHARE_WRITE, CreateDisposition.FILE_CREATE, 1)
        f.close()
        logger.info("Created folder: %s", new_path)
        return {"name": name, "path": new_path}
    finally:
        _disconnect(conn, session, tree)


def _list_dir_all(tree, imp, dir_path: str) -> list[dict]:
    from smbprotocol.open import (
        Open, FilePipePrinterAccessMask, FileAttributes,
        CreateDisposition, ShareAccess, FileInformationClass,
    )
    entries = []
    try:
        d = Open(tree, dir_path)
        d.create(imp, FilePipePrinterAccessMask.GENERIC_READ, FileAttributes.FILE_ATTRIBUTE_DIRECTORY,
                 ShareAccess.FILE_SHARE_READ, CreateDisposition.FILE_OPEN, 0)
    except Exception:
        return entries
    try:
        files = d.query_directory("*", FileInformationClass.FILE_DIRECTORY_INFORMATION)
        for f in files:
            try:
                name_field = f['file_name']
                raw = name_field.get_value() if hasattr(name_field, 'get_value') else bytes(name_field)
                name = raw.decode('utf-16-le').rstrip('\x00')
            except Exception:
                continue
            if name and name not in ('.', '..'):
                is_dir = False
                try:
                    attrs = f.get('file_attributes')
                    if attrs:
                        attr_val = attrs.get_value() if hasattr(attrs, 'get_value') else int(attrs)
                        is_dir = bool(attr_val & FileAttributes.FILE_ATTRIBUTE_DIRECTORY)
                except Exception:
                    pass
                entries.append({"name": name, "type": "folder" if is_dir else "file"})
    except Exception:
        pass
    finally:
        d.close()
    entries.sort(key=lambda x: (x["type"] != "folder", x["name"].lower()))
    return entries


def _delete_dir_recursive(tree, imp, dir_path: str) -> None:
    from smbprotocol.open import (
        Open, FilePipePrinterAccessMask, FileAttributes,
        CreateDisposition, ShareAccess, FileInformationClass,
    )
    FILE_DELETE_ON_CLOSE = 0x00001000
    entries = _list_dir_all(tree, imp, dir_path)
    for entry in entries:
        child = f"{dir_path}/{entry['name']}"
        if entry['type'] == 'folder':
            _delete_dir_recursive(tree, imp, child)
        else:
            try:
                f = Open(tree, child)
                f.create(imp, FilePipePrinterAccessMask.DELETE, FileAttributes.FILE_ATTRIBUTE_NORMAL,
                         ShareAccess.FILE_SHARE_DELETE, CreateDisposition.FILE_OPEN,
                         FILE_DELETE_ON_CLOSE)
                f.close()
            except Exception as e:
                logger.warning("Failed to delete SMB file %s: %s", child, e)
    try:
        d = Open(tree, dir_path)
        d.create(imp, FilePipePrinterAccessMask.DELETE, FileAttributes.FILE_ATTRIBUTE_DIRECTORY,
                 ShareAccess.FILE_SHARE_DELETE, CreateDisposition.FILE_OPEN,
                 FILE_DELETE_ON_CLOSE)
        d.close()
    except Exception as e:
        logger.warning("Failed to delete SMB dir %s: %s", dir_path, e)


def delete_path(settings, rel_path: str) -> None:
    conn, session, tree, imp = _connect(settings)
    try:
        normalized = _validate_path(rel_path)
        target = f"{settings.SMB_ROOT}/{normalized}" if normalized else settings.SMB_ROOT
        _delete_dir_recursive(tree, imp, target)
        logger.info("Deleted SMB path: %s", target)
    finally:
        _disconnect(conn, session, tree)


def save_file(settings, rel_path: str, filename: str, content: bytes) -> None:
    from smbprotocol.open import (
        Open, FilePipePrinterAccessMask, FileAttributes,
        CreateDisposition, ShareAccess,
    )
    conn, session, tree, imp = _connect(settings)
    try:
        normalized = _validate_path(rel_path)
        target_dir = f"{settings.SMB_ROOT}/{normalized}" if normalized else settings.SMB_ROOT
        _ensure_dir(tree, imp, target_dir)
        file_path = f"{target_dir}/{filename}"
        f = Open(tree, file_path)
        f.create(imp, FilePipePrinterAccessMask.GENERIC_WRITE, FileAttributes.FILE_ATTRIBUTE_NORMAL,
                 ShareAccess.FILE_SHARE_WRITE, CreateDisposition.FILE_OVERWRITE_IF, 0)
        f.write(content)
        f.close()
        logger.info("Saved file to SMB: %s", file_path)
    finally:
        _disconnect(conn, session, tree)
