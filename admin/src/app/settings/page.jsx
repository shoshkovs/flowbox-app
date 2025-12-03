import { Settings } from '../../components/Settings';
import { useState } from 'react';

export default function SettingsPage() {
  const [authToken] = useState(() => localStorage.getItem('admin_token'));

  return <Settings authToken={authToken} />;
}

