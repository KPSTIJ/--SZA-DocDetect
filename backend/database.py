from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from backend.config import Settings


class Base(DeclarativeBase):
    pass


def get_engine(settings: Settings):
    return create_async_engine(settings.DATABASE_URL, echo=False)


def get_sessionmaker(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db(request: Request):
    async with request.app.state.sessionmaker() as session:
        try:
            yield session
        finally:
            await session.close()
