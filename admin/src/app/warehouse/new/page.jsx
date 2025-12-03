import { WarehouseForm } from '../../../components/warehouse/WarehouseForm';
import { useState } from 'react';

export default function NewWarehousePage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <WarehouseForm authToken={authToken} />;
}

