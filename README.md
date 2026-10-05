# FastAPI Product Manager

A simple full-stack CRUD app for managing products, with a **FastAPI** + **PostgreSQL** backend and a **React** frontend.

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy, Pydantic, Uvicorn
- **Database:** PostgreSQL
- **Frontend:** React, Axios

## Project Structure

```
.
├── main.py              # FastAPI app and API routes
├── models.py            # Pydantic schema (request/response validation)
├── database_models.py   # SQLAlchemy table models
├── database.py          # Database connection / session setup
├── requirements.txt     # Python dependencies
└── frontend/            # React app
```

## API Endpoints

| Method | Endpoint          | Description              |
|--------|-------------------|--------------------------|
| GET    | `/`               | Health check / greeting  |
| GET    | `/products`       | Get all products         |
| GET    | `/products/{id}`  | Get a product by ID      |
| POST   | `/products`       | Add a new product        |
| PUT    | `/products/{id}`  | Update a product         |
| DELETE | `/products/{id}`  | Delete a product         |

Product shape:

```json
{
  "id": 1,
  "name": "Phone",
  "description": "A smartphone",
  "price": 699.99,
  "quantity": 50
}
```

### How IDs are assigned

The product **name** decides the ID (matched ignoring case and surrounding spaces):

- `POST /products` with a name that already exists updates that product and keeps its ID.
- A new name gets the next ID after the highest one. Any `id` sent with a POST is ignored.
- `PUT /products/{id}` refuses to rename a product to a name another product already has.

CSV imports follow the same rule. Columns are `name, description, price, quantity`; an `id` column is allowed but ignored.

On first startup, the database is seeded with a few sample products if the table is empty.

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL running locally

### 1. Backend

```bash
# Create and activate a virtual environment
python -m venv environment
# Windows
environment\Scripts\activate
# macOS / Linux
source environment/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Update the database URL in `database.py` to match your PostgreSQL setup:

```python
db_url = "postgresql://<user>:<password>@localhost:5432/<database>"
```

Run the server:

```bash
uvicorn main:app --reload
```

The API runs at http://localhost:8000. Interactive docs are available at http://localhost:8000/docs.

### 2. Frontend

```bash
cd frontend
npm install
npm start
```

The frontend runs at http://localhost:3000.
