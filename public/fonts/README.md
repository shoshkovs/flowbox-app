# Шрифты для FlowBox

## Необходимые файлы

Поместите файлы шрифтов в папку `public/fonts/`:

### RAVDIS BOLD
- `RAVDIS-BOLD.woff2` (рекомендуется)
- `RAVDIS-BOLD.woff` (fallback)
- `RAVDIS-BOLD.ttf` (fallback)

### Mont ExtraLight
- `Mont-ExtraLight.woff2` (рекомендуется)
- `Mont-ExtraLight.woff` (fallback)
- `Mont-ExtraLight.ttf` (fallback)

## Структура папок

```
public/
  └── fonts/
      ├── RAVDIS-BOLD.woff2
      ├── RAVDIS-BOLD.woff
      ├── RAVDIS-BOLD.ttf
      ├── Mont-ExtraLight.woff2
      ├── Mont-ExtraLight.woff
      └── Mont-ExtraLight.ttf
```

## Использование

Шрифты уже подключены в `styles.css`. Если файлы отсутствуют, будут использованы системные шрифты.

## Конвертация шрифтов

Если у вас есть только TTF файлы, можете конвертировать их в WOFF2:
- Используйте онлайн-конвертеры: https://cloudconvert.com/ttf-to-woff2
- Или инструменты командной строки

