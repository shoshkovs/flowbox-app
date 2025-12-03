import { CustomerDetail } from '../../../components/customers/CustomerDetail';
import { useParams } from 'react-router-dom';
import { useState } from 'react';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <CustomerDetail authToken={authToken} customerId={id} />;
}

