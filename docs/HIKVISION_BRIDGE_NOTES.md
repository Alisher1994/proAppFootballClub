# Hikvision Bridge / Karasu Bridge

Рабочие заметки по локальному bridge mini PC для терминалов Hikvision.

## Что где находится

- Проект: `proAppFootballClub`
- Railway сайт: `https://proapp.up.railway.app`
- GitHub: `https://github.com/Alisher1994/proAppFootballClub`
- Локальный mini PC hostname: `karasu-bridge`
- Пользователь SSH: `admina`
- Путь проекта на mini PC: `/home/admina/proAppFootballClub`
- Bridge файл: `/home/admina/proAppFootballClub/bridge/hikvision-school-bridge.mjs`
- systemd service: `karasu-school-bridge.service`

## IP адреса

- Mini PC внутри клуба: `192.168.1.5`
- Этот IP закреплен статически через netplan.
- Роутер / gateway: `192.168.1.1`
- DNS: `192.168.1.1`, `8.8.8.8`
- Внешний IP офиса на 2026-06-27: `84.54.84.117`
- Внешний IP может поменяться у провайдера, поэтому для доступа из дома лучше Tailscale/ZeroTier.

## Терминалы Hikvision

Настраиваются в админке:

`Настройки -> Hikvision`

Текущая схема:

- Вход: `192.168.1.8:443`
- Выход: `192.168.1.7:443`
- Протокол: `HTTPS`

Если IP терминалов поменялись, менять их надо в админке, не в коде.

## SSH внутри клуба

```bash
ssh admina@192.168.1.5
```

## Обновить bridge после изменений в GitHub

На mini PC:

```bash
cd /home/admina/proAppFootballClub
git pull --ff-only origin main
sudo systemctl restart karasu-school-bridge.service
sudo systemctl status karasu-school-bridge.service
```

Если статус открылся в просмотрщике, выйти клавишей `q`.

## Проверить bridge service

```bash
sudo systemctl status karasu-school-bridge.service
```

Логи:

```bash
journalctl -u karasu-school-bridge.service -n 100 --no-pager
```

Live-логи:

```bash
journalctl -u karasu-school-bridge.service -f
```

## Проверить сеть mini PC

Локальный IP:

```bash
hostname -I
ip -4 addr show enp1s0
ip route
```

Интернет / внешний IP:

```bash
curl -4 -s https://api.ipify.org
echo
```

Ожидаемо:

- `ip -4 addr show enp1s0` показывает `192.168.1.5/24`
- не должно быть слова `dynamic` для IPv4
- `ip route` показывает `default via 192.168.1.1 ... proto static`

## Netplan config

Файл:

```bash
/etc/netplan/00-installer-config.yaml
```

Текущий статический конфиг:

```yaml
network:
  version: 2
  ethernets:
    enp1s0:
      match:
        macaddress: 98:e7:f4:bd:71:d6
      set-name: enp1s0
      dhcp4: false
      dhcp6: true
      addresses:
        - 192.168.1.5/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 192.168.1.1
          - 8.8.8.8
  wifis: {}
```

Проверить и применить:

```bash
sudo netplan try
sudo netplan apply
```

Если нужно откатить:

```bash
sudo cp /etc/netplan/00-installer-config.yaml.bak /etc/netplan/00-installer-config.yaml
sudo netplan apply
```

## Bridge key

Ключ bridge не записываем в документацию.

Где смотреть:

`Настройки -> Hikvision -> DEVICE_INGEST_KEY`

Этот ключ должен быть в запуске bridge на mini PC как `DEVICE_INGEST_KEY`.

## Настройки в админке Hikvision

В админке есть важные переключатели:

- `Параллельно записывать вход и выход`
  - Ускоряет запись.
  - Логи могут идти вперемешку, потому что оба терминала пишутся одновременно.
  - Внутри каждого терминала порядок записи остается последовательным.

- `Удалять из терминалов записи, которых нет в системе`
  - Включать для полной сверки.
  - Удаляет старые numeric-ID записи из терминалов, если ученика/сотрудника уже нет в базе.
  - Нужно для случаев, когда старый ученик был удален из системы, но остался в памяти терминала.

## Когда нужна полная синхронизация

Полная синхронизация нужна:

- после изменения IP терминалов;
- после включения очистки старых записей;
- если есть подозрение, что в терминалах остались старые люди;
- после долгого отключения терминалов;
- для плановой ночной сверки.

Обычные изменения ученика/сотрудника отправляются точечно:

- добавление ученика;
- изменение фото;
- оплата;
- блокировка/разблокировка;
- удаление ученика или сотрудника.

## Что значит "фото уже было в терминале"

Это не ошибка.

Bridge обновил пользователя, но Hikvision ответил, что фото лица уже есть в терминале. Если доступ разрешен, человек должен проходить.

## Доступ из дома

Не рекомендуется открывать SSH mini PC наружу через роутер.

Лучший вариант:

- поставить Tailscale или ZeroTier на mini PC;
- поставить тот же VPN на домашний компьютер;
- заходить по VPN-IP mini PC.

Так не важны:

- внешний IP офиса;
- NAT провайдера;
- смена IP после перезагрузки роутера.

