export const mockProducts = [
  {
    id: 1,
    name: "Delicious Leche Flan",
    price: 150,
    stock: 20,
    category: "Leche Flan",
    description: "Sweet, creamy, and caramelized to perfection—made fresh daily.",
    image: "https://images.unsplash.com/photo-1579954115545-a95591f28b26?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: 2,
    name: "Brownies Overload",
    price: 90,
    stock: 50,
    category: "Choco",
    description: "Rich, fudgy brownies topped with nuts and chocolate chips.",
    image: "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: 3,
    name: "Caramel Bars",
    price: 85,
    stock: 49,
    category: "Choco",
    description: "Chewy bars packed with caramel and topped with chocolate chips.",
    image: "https://images.unsplash.com/photo-1548365328-8c6db3220e4c?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: 4,
    name: "Choco Crinkles",
    price: 75,
    stock: 30,
    category: "Pastries",
    description: "Soft, fudgy chocolate cookies coated in powdered sugar.",
    image: "https://images.unsplash.com/photo-1621236378699-8597ffc34082?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: 5,
    name: "Marble Cookies",
    price: 80,
    stock: 40,
    category: "Choco",
    description: "A perfect blend of chocolate and vanilla cookie dough.",
    image: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: 6,
    name: "Butter Macaroons",
    price: 95,
    stock: 25,
    category: "Pastries",
    description: "Sweet coconut drops baked to a golden brown.",
    image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&q=80&w=800",
  }
];

export const getCategories = () => {
  const categories = new Set(mockProducts.map(p => p.category));
  return Array.from(categories);
};
