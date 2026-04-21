FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY send_packets.py .
COPY data/ /app/data/
CMD ["python", "send_packets.py"]