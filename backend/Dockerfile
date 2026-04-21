FROM python:3.9-slim
WORKDIR /app

# Обновляем pip и устанавливаем библиотеки напрямую без requirements.txt
RUN pip install --upgrade pip && \
    pip install --no-cache-dir Flask flask-cors

COPY app.py .
RUN mkdir -p static
EXPOSE 5000
CMD ["python", "app.py"]