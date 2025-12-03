import { Dashboard } from '../../components/Dashboard';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <Dashboard authToken={authToken} />;
}

