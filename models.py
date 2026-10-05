from pydantic import BaseModel
from typing import Optional



class Product(BaseModel):
    # Optional on create: the server assigns the next free ID
    id: Optional[int] = None
    name: str
    description: str
    price: float
    quantity: int


