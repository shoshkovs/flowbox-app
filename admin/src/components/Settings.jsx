import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './ui/tabs';
import { Directories } from './Directories';

const API_BASE = window.location.origin;

export function Settings({ authToken }) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({
    shopName: 'Цветочный рай',
    shopPhone: '+7 (999) 123-45-67',
    shopEmail: 'info@flowers.shop',
    shopAddress: 'г. Москва, ул. Цветочная, д. 10',
    workStart: '08:00',
    workEnd: '22:00',
    minOrder: 1000,
    bonusProgramEnabled: true,
    bonusPercent: 5,
    bonusMax: 20,
    serviceFee: 450,
    deliveryZones: [
      { id: 1, name: 'Зона 1 (Центр)', price: 300, freeFrom: 3000 },
      { id: 2, name: 'Зона 2 (Средняя)', price: 500, freeFrom: 5000 },
    ],
    deliverySlots: [
      '08:00-10:00',
      '10:00-12:00',
      '12:00-14:00',
      '14:00-16:00',
      '16:00-18:00',
      '18:00-20:00',
      '20:00-22:00',
    ],
    deliveryAdvance: 7,
    paymentMethods: {
      telegram: true,
      cash: true,
      card: false,
    },
    stripeKey: '',
    yookassaShopId: '',
    yookassaSecret: '',
    taxSystem: 'usn',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/settings`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Ошибка загрузки настроек:', error);
    }
  };

  const saveSettings = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/settings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        alert('Настройки сохранены');
      } else {
        alert('Ошибка сохранения настроек');
      }
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
      alert('Ошибка сохранения настроек');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Настройки</h1>
        <p className="text-gray-600 mt-1">
          Управление параметрами магазина
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">Общие</TabsTrigger>
          <TabsTrigger value="directories">
            Справочники
          </TabsTrigger>
          <TabsTrigger value="delivery">Доставка</TabsTrigger>
          <TabsTrigger value="payment">Оплата</TabsTrigger>
          <TabsTrigger value="users">Пользователи</TabsTrigger>
        </TabsList>

        <TabsContent value="directories">
          <Directories authToken={authToken} />
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Основная информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="shopName">
                  Название магазина
                </Label>
                <Input
                  id="shopName"
                  value={settings.shopName}
                  onChange={(e) => setSettings({ ...settings, shopName: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="shopPhone">Телефон</Label>
                <Input
                  id="shopPhone"
                  value={settings.shopPhone}
                  onChange={(e) => setSettings({ ...settings, shopPhone: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="shopEmail">Email</Label>
                <Input
                  id="shopEmail"
                  type="email"
                  value={settings.shopEmail}
                  onChange={(e) => setSettings({ ...settings, shopEmail: e.target.value })}
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="shopAddress">Адрес</Label>
                <Textarea
                  id="shopAddress"
                  value={settings.shopAddress}
                  onChange={(e) => setSettings({ ...settings, shopAddress: e.target.value })}
                  rows={3}
                  className="mt-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="workStart">
                    Время работы с
                  </Label>
                  <Input
                    id="workStart"
                    type="time"
                    value={settings.workStart}
                    onChange={(e) => setSettings({ ...settings, workStart: e.target.value })}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="workEnd">
                    Время работы до
                  </Label>
                  <Input
                    id="workEnd"
                    type="time"
                    value={settings.workEnd}
                    onChange={(e) => setSettings({ ...settings, workEnd: e.target.value })}
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="minOrder">
                  Минимальная сумма заказа (₽)
                </Label>
                <Input
                  id="minOrder"
                  type="number"
                  value={settings.minOrder}
                  onChange={(e) => setSettings({ ...settings, minOrder: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                />
              </div>

              <Button onClick={saveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Сохранить изменения
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Бонусная программа</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Включить бонусную программу</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Начисление и списание бонусов
                  </p>
                </div>
                <Switch 
                  checked={settings.bonusProgramEnabled}
                  onChange={(checked) => setSettings({ ...settings, bonusProgramEnabled: checked })}
                />
              </div>

              <div>
                <Label htmlFor="bonusPercent">
                  Процент начисления (%)
                </Label>
                <Input
                  id="bonusPercent"
                  type="number"
                  value={settings.bonusPercent}
                  onChange={(e) => setSettings({ ...settings, bonusPercent: parseFloat(e.target.value) || 0 })}
                  className="mt-2"
                />
                <p className="text-sm text-gray-500 mt-1">
                  {settings.bonusPercent}% от суммы заказа будет начислено в виде
                  бонусов
                </p>
              </div>

              <div>
                <Label htmlFor="bonusMax">
                  Максимум бонусов к списанию (%)
                </Label>
                <Input
                  id="bonusMax"
                  type="number"
                  value={settings.bonusMax}
                  onChange={(e) => setSettings({ ...settings, bonusMax: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Клиент может оплатить бонусами до {settings.bonusMax}% от суммы
                  заказа
                </p>
              </div>

              <Button onClick={saveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Сохранить изменения
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delivery" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Зоны доставки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                {settings.deliveryZones.map((zone) => (
                  <div key={zone.id} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">
                        {zone.name}
                      </h4>
                      <Button variant="ghost" size="sm">
                        Удалить
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Стоимость доставки (₽)</Label>
                        <Input
                          type="number"
                          value={zone.price}
                          onChange={(e) => {
                            const newZones = settings.deliveryZones.map(z =>
                              z.id === zone.id ? { ...z, price: parseInt(e.target.value) || 0 } : z
                            );
                            setSettings({ ...settings, deliveryZones: newZones });
                          }}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Бесплатно от (₽)</Label>
                        <Input
                          type="number"
                          value={zone.freeFrom}
                          onChange={(e) => {
                            const newZones = settings.deliveryZones.map(z =>
                              z.id === zone.id ? { ...z, freeFrom: parseInt(e.target.value) || 0 } : z
                            );
                            setSettings({ ...settings, deliveryZones: newZones });
                          }}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline">Добавить зону</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Слоты доставки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {settings.deliverySlots.map((slot) => (
                  <div
                    key={slot}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <span>{slot}</span>
                    <Switch defaultChecked />
                  </div>
                ))}
              </div>

              <Button onClick={saveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Сохранить изменения
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Дополнительные настройки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="deliveryAdvance">
                  Предоплата доставки (дней)
                </Label>
                <Input
                  id="deliveryAdvance"
                  type="number"
                  value={settings.deliveryAdvance}
                  onChange={(e) => setSettings({ ...settings, deliveryAdvance: parseInt(e.target.value) || 0 })}
                  className="mt-2"
                />
                <p className="text-sm text-gray-500 mt-1">
                  На сколько дней вперед можно заказать доставку
                </p>
              </div>

              <Button onClick={saveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Сохранить изменения
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Способы оплаты</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <Label>
                    Онлайн оплата (Telegram Payment)
                  </Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Прием платежей через Telegram
                  </p>
                </div>
                <Switch 
                  checked={settings.paymentMethods.telegram}
                  onChange={(checked) => setSettings({
                    ...settings,
                    paymentMethods: { ...settings.paymentMethods, telegram: checked }
                  })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <Label>Оплата наличными курьеру</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    При получении заказа
                  </p>
                </div>
                <Switch 
                  checked={settings.paymentMethods.cash}
                  onChange={(checked) => setSettings({
                    ...settings,
                    paymentMethods: { ...settings.paymentMethods, cash: checked }
                  })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <Label>Оплата картой курьеру</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Терминал при доставке
                  </p>
                </div>
                <Switch 
                  checked={settings.paymentMethods.card}
                  onChange={(checked) => setSettings({
                    ...settings,
                    paymentMethods: { ...settings.paymentMethods, card: checked }
                  })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API ключи платежных систем</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="stripeKey">
                  Stripe API Key
                </Label>
                <Input
                  id="stripeKey"
                  type="password"
                  value={settings.stripeKey}
                  onChange={(e) => setSettings({ ...settings, stripeKey: e.target.value })}
                  placeholder="sk_live_..."
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="yookassaKey">
                  ЮKassa Shop ID
                </Label>
                <Input
                  id="yookassaKey"
                  value={settings.yookassaShopId}
                  onChange={(e) => setSettings({ ...settings, yookassaShopId: e.target.value })}
                  placeholder="123456"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="yookassaSecret">
                  ЮKassa Secret Key
                </Label>
                <Input
                  id="yookassaSecret"
                  type="password"
                  value={settings.yookassaSecret}
                  onChange={(e) => setSettings({ ...settings, yookassaSecret: e.target.value })}
                  placeholder="live_..."
                  className="mt-2"
                />
              </div>

              <Button onClick={saveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Сохранить изменения
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Налоги</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="taxSystem">
                  Система налогообложения
                </Label>
                <Select 
                  value={settings.taxSystem}
                  onValueChange={(value) => setSettings({ ...settings, taxSystem: value })}
                >
                  <SelectTrigger
                    id="taxSystem"
                    className="mt-2"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usn">УСН 6%</SelectItem>
                    <SelectItem value="usn15">
                      УСН 15%
                    </SelectItem>
                    <SelectItem value="osn">ОСНО</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={saveSettings}>
                <Save className="w-4 h-4 mr-2" />
                Сохранить изменения
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Сотрудники</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">Администратор</p>
                    <p className="text-sm text-gray-500">
                      admin@flower.shop
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      Полный доступ
                    </span>
                    <Button variant="ghost" size="sm">
                      Изменить
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">Оператор</p>
                    <p className="text-sm text-gray-500">
                      operator@flower.shop
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      Заказы, Склад
                    </span>
                    <Button variant="ghost" size="sm">
                      Изменить
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">
                      Курьер (Иван К.)
                    </p>
                    <p className="text-sm text-gray-500">
                      courier1@flower.shop
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      Только доставки
                    </span>
                    <Button variant="ghost" size="sm">
                      Изменить
                    </Button>
                  </div>
                </div>
              </div>

              <Button variant="outline">
                Добавить сотрудника
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Роли и права доступа</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4 p-3 bg-gray-100 rounded-lg">
                  <div className="font-medium">Раздел</div>
                  <div className="text-center font-medium">
                    Админ
                  </div>
                  <div className="text-center font-medium">
                    Оператор
                  </div>
                  <div className="text-center font-medium">
                    Курьер
                  </div>
                </div>

                {[
                  {
                    name: "Дашборд",
                    admin: true,
                    operator: true,
                    courier: false,
                  },
                  {
                    name: "Товары",
                    admin: true,
                    operator: true,
                    courier: false,
                  },
                  {
                    name: "Склад",
                    admin: true,
                    operator: true,
                    courier: false,
                  },
                  {
                    name: "Заказы",
                    admin: true,
                    operator: true,
                    courier: false,
                  },
                  {
                    name: "Доставка",
                    admin: true,
                    operator: true,
                    courier: true,
                  },
                  {
                    name: "Аналитика",
                    admin: true,
                    operator: false,
                    courier: false,
                  },
                  {
                    name: "Клиенты",
                    admin: true,
                    operator: true,
                    courier: false,
                  },
                  {
                    name: "Настройки",
                    admin: true,
                    operator: false,
                    courier: false,
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="grid grid-cols-4 gap-4 p-3 border-b"
                  >
                    <div>{item.name}</div>
                    <div className="text-center">
                      <Switch checked={item.admin} disabled />
                    </div>
                    <div className="text-center">
                      <Switch checked={item.operator} />
                    </div>
                    <div className="text-center">
                      <Switch checked={item.courier} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
