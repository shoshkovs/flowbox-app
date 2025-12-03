import { Customers } from '../../components/Customers';
import { useState } from 'react';

export default function CustomersPage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <Customers authToken={authToken} />;
}

