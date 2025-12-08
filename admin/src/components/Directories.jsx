import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const API_BASE = window.location.origin;

export function Directories({ authToken }) {
  const [activeTab, setActiveTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [colors, setColors] = useState([]);
  const [qualities, setQualities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCategories();
    loadColors();
    loadQualities();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/categories`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки категорий:', error);
    }
  };

  const loadColors = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/colors`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setColors(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки цветов:', error);
    }
  };

  const loadQualities = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/product-qualities`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setQualities(data);
      }
    } catch (error) {
      console.error('Ошибка загрузки качеств:', error);
    }
  };

  const filteredCategories = categories.filter(cat =>
    cat.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Справочники</h2>
        <p className="text-gray-600 mt-1">
          Управление категориями, цветами и типами товаров
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="categories">Категории</TabsTrigger>
          <TabsTrigger value="colors">Цвета</TabsTrigger>
          <TabsTrigger value="qualities">Типы товаров</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Категории товаров</CardTitle>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить категорию
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Поиск по категориям..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-4"
              />
              <div className="space-y-2">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Название</th>
                      <th className="text-left py-2">Товаров</th>
                      <th className="text-right py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCategories.map((category) => (
                      <tr key={category.id} className="border-b">
                        <td className="py-3">{category.name}</td>
                        <td className="py-3">{category.products_count || 0}</td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="colors" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Цвета</CardTitle>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить цвет
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {colors.map((color) => (
                  <div key={color.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>{color.name}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qualities" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Типы товаров</CardTitle>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить тип
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {qualities.map((quality) => (
                  <div key={quality.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>{quality.name}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
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

