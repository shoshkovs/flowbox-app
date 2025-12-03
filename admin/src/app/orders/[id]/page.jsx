import { OrderDetail } from '../../../components/orders/OrderDetail';
import { useParams } from 'react-router-dom';
import { useState } from 'react';

export default function OrderDetailPage() {
  const { id } = useParams();
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <OrderDetail authToken={authToken} orderId={id} />;
}

