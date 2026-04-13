# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the repository contents into the container at /app
COPY . /app/

# Install dependencies (if requirements.txt exists)
RUN pip install --no-cache-dir -r requirements.txt || true

# Make port 8080 available
EXPOSE 8080

# Workbench expects a web server on 8080; Streamlit must bind all interfaces.
CMD ["streamlit", "run", "dashboard-app.py", "--server.port=8080", "--server.address=0.0.0.0", "--browser.gatherUsageStats=false", "--server.fileWatcherType", "none"]