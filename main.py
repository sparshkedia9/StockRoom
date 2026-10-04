from fastapi import Depends , FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import Product
from database import session, engine
import database_models
from sqlalchemy.orm import Session

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

database_models.Base.metadata.create_all(bind=engine)

@app.get("/")
def greet():
    return "hello babes"
greet()


products=[
    Product(id=1, name="Phone", description="A smartphone", price=699.99, quantity=50),
    Product(id=2, name="Laptop", description="A powerful laptop", price=999.99, quantity=30),
    Product(id=3, name="Pen", description="A blue ink pen", price=1.99, quantity=100),
    Product(id=4, name="Table", description="A wooden table", price=199.99, quantity=20),
]


def get_db():
    db = session()
    try:
        yield db
    finally:
        db.close()


def init_db():

    db = session()
    try:
        count = db.query(database_models.Product).count()
        if count ==0:
            for product in products:
                    db.add(database_models.Product(**product.model_dump()))

            db.commit()
    finally:
        db.close()

init_db()


@app.get("/products")
def get_all_products(db: Session = Depends(get_db)):

    db_products = db.query(database_models.Product).all()

    return db_products



@app.get("/products/{id}")
def get_products_id(id: int, db: Session = Depends(get_db)):
    db_products = db.query(database_models.Product).filter(database_models.Product.id == id).first( )
    if db_products:
        return db_products

    raise HTTPException(status_code=404, detail="product not found")

@app.post("/products")
def add_products(product: Product, db: Session = Depends(get_db)):
    if db.query(database_models.Product).filter(database_models.Product.id == product.id).first( ):
        raise HTTPException(status_code=400, detail="product with this id already exists")
    db.add(database_models.Product(**product.model_dump()))
    db.commit()
    return product


@app.put("/products/{id}")
def update_products(id: int, product:Product, db: Session = Depends(get_db)):
    db_products = db.query(database_models.Product).filter(database_models.Product.id == id).first( )
    if db_products:
        db_products.name = product.name
        db_products.description = product.description
        db_products.price = product.price
        db_products.quantity = product.quantity
        db.commit()
        return "product updated"
    else:
        raise HTTPException(status_code=404, detail="no product found")

@app.delete("/products/{id}")
def del_products(id: int, db: Session = Depends(get_db)):
    db_products = db.query(database_models.Product).filter(database_models.Product.id == id).first( )
    if db_products:
        db.delete(db_products)
        db.commit()
        return "product deleted"
    else:
        raise HTTPException(status_code=404, detail="product not found")
