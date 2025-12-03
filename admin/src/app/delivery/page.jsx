import { Delivery } from '../../components/Delivery';
import { useState } from 'react';

export default function DeliveryPage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <Delivery authToken={authToken} />;
}

