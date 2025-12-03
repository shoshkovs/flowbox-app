import { Analytics } from '../../components/Analytics';
import { useState } from 'react';

export default function AnalyticsPage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <Analytics authToken={authToken} />;
}

