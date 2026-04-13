# Build for Workbench VMs (typically linux/amd64). On Apple Silicon:
#   docker buildx build --platform linux/amd64 -t <registry>/<image>:<tag> --push .
FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

COPY dashboard-app.py .
COPY .streamlit/config.toml .streamlit/config.toml

EXPOSE 8080

# Use python -m so Streamlit is found even if scripts PATH differs in the runtime.
CMD ["python", "-m", "streamlit", "run", "dashboard-app.py", "--browser.gatherUsageStats=false"]
