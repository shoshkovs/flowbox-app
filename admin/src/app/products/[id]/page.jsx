import { ProductForm } from '../../../components/products/ProductForm';
import { useParams } from 'react-router-dom';
import { useState } from 'react';

export default function EditProductPage() {
  const { id } = useParams();
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <ProductForm authToken={authToken} productId={id} />;
}

