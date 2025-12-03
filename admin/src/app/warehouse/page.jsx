import { Warehouse } from '../../components/Warehouse';
import { useState } from 'react';

export default function WarehousePage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <Warehouse authToken={authToken} />;
}

