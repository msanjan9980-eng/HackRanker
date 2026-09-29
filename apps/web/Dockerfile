FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/index.html /usr/share/nginx/html/index.html
COPY apps/web/judge.html /usr/share/nginx/html/judge.html
COPY apps/web/submit.html /usr/share/nginx/html/submit.html
COPY apps/web/status.html /usr/share/nginx/html/status.html