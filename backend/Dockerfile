FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
# Создаем папку static (Flask будет искать там index.html, но в Docker мы подмонтируем её)
RUN mkdir -p static
EXPOSE 5000
CMD ["python", "app.py"]