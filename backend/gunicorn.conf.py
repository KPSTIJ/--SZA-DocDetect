# Production Gunicorn config
# Запуск: gunicorn backend.main:app -c gunicorn.conf.py

bind = "0.0.0.0:8000"
workers = 4
worker_class = "uvicorn.workers.UvicornWorker"
timeout = 300
keepalive = 5
accesslog = "./logs/access.log"
errorlog = "./logs/error.log"
loglevel = "info"
capture_output = True
