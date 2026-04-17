FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV POETRY_VIRTUALENVS_IN_PROJECT=true
ENV POETRY_NO_INTERACTION=1

WORKDIR /app

RUN pip install --no-cache-dir poetry

COPY services/chem-service/pyproject.toml ./pyproject.toml
COPY services/chem-service/poetry.lock ./poetry.lock
COPY services/chem-service/poetry.toml ./poetry.toml

RUN poetry install --only main --no-root

COPY services/chem-service /app

EXPOSE 18081

CMD ["poetry", "run", "python", "app.py"]
