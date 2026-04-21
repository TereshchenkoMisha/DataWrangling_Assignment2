FROM python:3.9-slim
WORKDIR /app

# Обновляем pip и устанавливаем requests напрямую
RUN pip install --upgrade pip && \
    pip install --no-cache-dir requests

COPY send_packets.py .
COPY data/ /app/data/
CMD ["python", "send_packets.py"]