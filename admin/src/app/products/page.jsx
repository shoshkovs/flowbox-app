import { Products } from '../../components/Products';
import { useState } from 'react';

export default function ProductsPage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <Products authToken={authToken} />;
}

