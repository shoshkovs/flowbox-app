import { ProductForm } from '../../../components/products/ProductForm';
import { useState } from 'react';

export default function NewProductPage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <ProductForm authToken={authToken} />;
}

