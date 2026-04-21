FROM nginx:alpine
# Удаляем дефолтную статику Nginx
RUN rm -rf /usr/share/nginx/html/*
# Копируем наш фронтенд
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 80