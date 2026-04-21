# DataWrangling_Assignment2
🌍 Network Traffic Visualization Globe
Интерактивная визуализация веб-трафика в реальном времени на прозрачном 3D-глобусе. Система считывает данные о пакетах из CSV-файла, эмулирует их отправку на Flask-сервер и отображает геолокации отправителей с помощью Three.js.

🛠 Технологический стек
Backend: Python 3.9, Flask, Flask-CORS
Data Sender: Python 3.9, Requests
Frontend: Three.js (WebGL), Vanilla JavaScript, HTML5 Canvas
Cartography: TopoJSON, world-atlas (Natural Earth)
Deployment: Docker, Docker Compose, Nginx
📁 Структура проекта
.├── docker-compose.yml
 ├── README.md
 │    ├── backend/                 
 │    ├── Dockerfile
 │    ├── requirements.txt
 │    └── app.py               
 ├── sender/                  
 │   ├── Dockerfile
 │   ├── requirements.txt
 │   ├── send_packets.py      
 │   └── data/
 │       └── ip_addresses.csv
 └── frontend/               
     ├── Dockerfile
     ├── index.html
     ├── style.css
     └── script.js
🚀 Запуск проекта (через Docker)
Для запуска всей системы необходимы установленные Docker и Docker Compose.

Клонируйте репозиторий или скачайте архив с проектом.
Откройте терминал в корневой папке проекта (где лежит docker-compose.yml).
Выполните команду:
bash

docker-compose up --build
Откройте браузер и перейдите по адресу:
👉 http://localhost:5000
Примечание: Первый запуск может занять около минуты (скачивание базовых образов Python и Nginx, установка зависимостей и загрузка карты мира).
