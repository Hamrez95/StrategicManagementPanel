FROM python:3.12.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt
COPY . ./
RUN useradd --create-home --uid 10001 stratino && mkdir -p /private-files && chown stratino:stratino /private-files
USER stratino
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
