import { Orders } from '../../components/Orders';
import { useState } from 'react';

export default function OrdersPage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <Orders authToken={authToken} />;
}

