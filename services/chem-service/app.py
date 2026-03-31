"""Flask entrypoint for the chemistry microservice."""

from __future__ import annotations

import os

from flask import Flask

from routes.normalize import normalize_bp
from routes.ocr import ocr_bp
from routes.render import render_bp


def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.register_blueprint(ocr_bp)
    app.register_blueprint(normalize_bp)
    app.register_blueprint(render_bp)
    return app


def main() -> None:
    """Run the chem-service development server."""
    app = create_app()
    port = int(os.environ.get("CHEM_SERVICE_PORT", "8765"))
    app.run(host="0.0.0.0", port=port, debug=False)


if __name__ == "__main__":
    main()
