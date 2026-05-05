// Мультиязычная поддержка: ru (по умолчанию), uz, en

const SUPPORTED_LANGS = ['ru', 'uz', 'en'];
const DEFAULT_LANG = 'ru';

const LANG_NAMES = {
  ru: '🇷🇺 Русский',
  uz: '🇺🇿 O‘zbekcha',
  en: '🇬🇧 English',
};

const TRANSLATIONS = {
  ru: {
    // Меню
    'menu.create_table': '🎮 Создать стол',
    'menu.public_tables': '📋 Публичные столы',
    'menu.balance': '💰 Баланс',
    'menu.referrals': '👥 Рефералы',
    'menu.deposit': '📥 Пополнить',
    'menu.withdraw': '📤 Вывести',
    'menu.instruction': '📖 Инструкция',
    'menu.language': '🌐 Язык',
    'menu.admin': '🛠 Админ',

    // Старт / язык
    'lang.choose': '🌐 <b>Выберите язык / Tilni tanlang / Choose language</b>',
    'lang.changed': '✅ Язык изменён на <b>Русский</b>',
    'start.welcome':
      '👋 Добро пожаловать в <b>Лотерея Бот</b>!\n💰 Баланс: <b>${balance}</b>\n\nВыберите действие в меню ниже:',
    'start.referral_used': '\n\n✅ Вы зарегистрированы по реферальной ссылке от <b>{name}</b>',
    'start.invite_in_game':
      '⚠️ Вы уже за другим столом и не можете присоединиться по ссылке сейчас.',

    // Инструкция
    'instruction.text':
      '📖 <b>Как играть в Лотерея Бот</b>\n\n' +
      '🎮 <b>Об игре</b>\nЛотерея Бот — мультиплеерная лотерея, в которой за одним столом играют 2–6 игроков. ' +
      'Каждый игрок покупает один или несколько билетов. Каждый билет — случайный набор из 5 чисел от 1 до 30.\n\n' +
      '🎯 <b>Как проходит раунд</b>\n' +
      '1. Создайте стол или присоединитесь к публичному/приватному.\n' +
      '2. Выберите ставку, число игроков и билетов.\n' +
      '3. Когда стол заполнен или создатель запускает игру, числа выпадают по одному каждые пару секунд.\n' +
      '4. Первый игрок, у кого все 5 чисел в билете выпали, забирает весь банк (минус 5% комиссии).\n\n' +
      '💰 <b>Ставки и билеты</b>\n' +
      '• Быстрые ставки: $1, $5, $10 или любая своя сумма (целые доллары).\n' +
      '• Билетов на игрока: любое положительное число.\n' +
      '• Стоимость = ставка × билеты, списывается с баланса при входе.\n\n' +
      '🏆 <b>Призы</b>\n' +
      '• Победитель получает банк минус 5% комиссии.\n' +
      '• Если все числа кончились без победителя — все ставки возвращаются.\n\n' +
      '👥 <b>Рефералы</b>\n• Приглашайте друзей и получайте $0.05 за каждое успешное пополнение реферала.\n\n' +
      '📰 Следите за новостями в нашем канале!',
    'instruction.channel': '📰 Подписаться на канал',

    // Создание стола
    'ct.in_game': '⚠️ Вы уже за столом. Дождитесь окончания игры.',
    'ct.step1': '🎮 Создание стола\n\n1) Выберите ставку:',
    'ct.btn_other': '💵 Другая сумма',
    'ct.custom_bet_prompt':
      '💵 Введите свою ставку в целых долларах (положительное число, без копеек):',
    'ct.step2': '🎮 Создание стола\n\nСтавка: <b>${bet}</b>\n\n2) Выберите число игроков (2–6):',
    'ct.step3':
      '🎮 Создание стола\n\nСтавка: <b>${bet}</b>\nИгроков: <b>{max}</b>\n\n3) Выберите тип стола:',
    'ct.btn_public': '🌐 Публичный',
    'ct.btn_private': '🔒 Приватный',
    'ct.type_public': '🌐 Публичный',
    'ct.type_private': '🔒 Приватный',
    'ct.step4':
      '🎮 Создание стола\n\nСтавка: <b>${bet}</b>\nИгроков: <b>{max}</b>\nТип: <b>{type}</b>\n\n4) Введите количество билетов для себя (положительное число):',
    'ct.tickets_prompt': '4) Введите количество билетов для себя (положительное число):',
    'ct.invalid_int': '❌ Введите положительное целое число. Попробуйте ещё раз:',
    'ct.invalid_tickets': '❌ Введите положительное целое число билетов. Попробуйте ещё раз:',
    'ct.created_private':
      '✅ Создан приватный стол: <b>#{id}</b>\n💵 Ставка: <b>${bet}</b>\n👥 Макс. игроков: <b>{max}</b>\n\n🔗 Ссылка-приглашение:\n🔴 <code>{link}</code>',
    'ct.created_public':
      '✅ Создан публичный стол: <b>#{id}</b>\n💵 Ставка: <b>${bet}</b>\n👥 Макс. игроков: <b>{max}</b>\n\nОн добавлен в «📋 Публичные столы».',

    // Публичные столы
    'pt.empty': '📋 Сейчас нет публичных столов. Создайте новый!',
    'pt.title': '📋 <b>Публичные столы:</b>',
    'pt.btn': '#{id} | ${bet} | {players}/{max} игроков',
    'pt.unavailable': '❌ Стол недоступен',
    'pt.btn_back': '« Назад к списку',
    'pt.join_prompt':
      '🎮 Стол #{id}\n💵 Ставка: <b>${bet}</b>\n👥 Игроков: <b>{players}/{max}</b>\n\nВведите количество билетов (положительное число):',
    'pt.private_prompt':
      '🔒 <b>Приватный стол #{id}</b>\n💵 Ставка: <b>${bet}</b>\n👥 Игроков: <b>{players}/{max}</b>\n\nВведите количество билетов (положительное число):',
    'pt.private_not_found': '❌ Приватный стол не найден или уже завершён.',
    'pt.private_closed': '❌ Этот стол больше не принимает игроков.',

    // Старт игры
    'start_btn': '🚀 Начать игру',
    'start.not_creator': '❌ Запустить игру может только создатель.',
    'start.not_enough': '❌ Нужно минимум 2 игрока, чтобы начать.',
    'start.unavailable': '❌ Игра уже идёт или стол недоступен.',
    'start.fail': '❌ Не удалось запустить игру',
    'start.table_not_found': '❌ Стол не найден.',

    // Ошибки присоединения
    'err.in_game': '⚠️ Вы уже за другим столом.',
    'err.table_not_found': '❌ Стол не найден.',
    'err.table_unavailable': '❌ Стол больше недоступен.',
    'err.table_full': '❌ Стол уже заполнен.',
    'err.private_only': '❌ Это приватный стол. Вход только по ссылке-приглашению.',
    'err.invalid_tickets': '❌ Количество билетов должно быть положительным целым числом.',
    'err.invalid_bet': '❌ Ставка должна быть положительным целым числом.',
    'err.already_in_table': '⚠️ Вы уже за этим столом.',
    'err.no_funds': '❌ Недостаточно средств. Нужно как минимум <b>${needed}</b>.',
    'err.join_fail': '❌ Не удалось присоединиться к столу.',

    // Баланс
    'bal.title':
      '💰 <b>Баланс</b>\n\n🏷 Имя: {name}\n💵 Баланс: <b>${balance}</b>\n📊 Потрачено: <b>${spent}</b>\n🎮 Игр сыграно: <b>{games}</b>\n🏆 Побед: <b>{wins}</b>',

    // Рефералы
    'ref.title':
      '👥 <b>Реферальная программа</b>\n\nПриглашайте друзей и получайте <b>$0.05</b> за каждое успешное пополнение.\n\n👤 Рефералов: <b>{count}</b>\n💵 Заработано: <b>${earned}</b>\n\n🔗 Ваша ссылка:\n<code>{link}</code>',

    // Депозит
    'dep.title':
      '📥 <b>Пополнение</b>\n\n💰 Текущий баланс: <b>${balance}</b>\n\nОтправьте средства на адрес:\n<code>{address}</code>\n\nПосле оплаты нажмите кнопку ниже и введите сумму.',
    'dep.btn_paid': '✅ Я оплатил(а)',
    'dep.fail': '❌ Не удалось создать заявку на пополнение.',
    'dep.amount_prompt': '💵 Введите сумму пополнения (например, 5 или 12.5):',
    'dep.invalid_amount': '❌ Введите корректную сумму (число больше 0).',
    'dep.already': '⚠️ Эта заявка уже обработана.',
    'dep.expired': '❌ Сессия истекла. Нажмите «📥 Пополнить» ещё раз.',
    'dep.fail_process': '❌ Не удалось обработать пополнение. Проверьте сумму и попробуйте ещё раз.',
    'dep.success': '✅ <b>Пополнение зачислено</b>\n\n💵 Сумма: <b>${amount}</b>\n💰 Новый баланс: <b>${balance}</b>',
    'dep.referral_reward': '\n\n👥 Награда рефереру: <b>${amount}</b>',

    // Вывод
    'wd.no_funds': '❌ У вас нет средств для вывода.',
    'wd.address_prompt': '📤 <b>Вывод</b>\n\n💰 Баланс: <b>${balance}</b>\n\nВведите адрес кошелька для вывода:',
    'wd.address_short': '❌ Слишком короткий адрес. Введите корректный адрес кошелька:',
    'wd.amount_prompt': '📤 Адрес: <code>{address}</code>\n\nВведите сумму (макс <b>${max}</b>):',
    'wd.invalid_amount': '❌ Введите корректную сумму (число больше 0):',
    'wd.success':
      '✅ <b>Заявка на вывод создана</b>\n\n💵 Сумма: <b>${amount}</b>\n📬 Адрес: <code>{address}</code>\n📋 Статус: <b>{status}</b>\n\n⏳ Средства будут отправлены в ближайшее время.',
    'wd.no_funds_alt': '❌ Недостаточно баланса.',
    'wd.invalid_amount_alt': '❌ Некорректная сумма.',
    'wd.invalid_address': '❌ Некорректный адрес.',
    'wd.fail': '❌ Не удалось создать заявку.',
    'wd.notify_user':
      '📤 <b>Заявка на вывод</b>\n\n💵 Сумма: <b>${amount}</b>\n📋 Статус: <b>{status}</b>\n\n{note}',
    'wd.approved_note': '✅ Ваш вывод одобрен и обработан.',
    'wd.rejected_note': '❌ Ваш вывод отклонён, средства возвращены на баланс.',

    // Бан
    'banned': '🚫 Вы заблокированы и не можете пользоваться ботом.',
    'banned.short': '🚫 Вы заблокированы.',

    // Игровой движок
    'game.you': ' (вы)',
    'game.waiting_title': '🎮 <b>Стол #{id} | ${bet}</b>',
    'game.privacy_pub': '🌐 Публичный',
    'game.privacy_prv': '🔒 Приватный',
    'game.players_label': '👥 Игроков',
    'game.pot_label': '💰 Банк',
    'game.players_list_label': 'Игроки',
    'game.need_more_players': '⏳ Нужно минимум 2 игрока для старта.',
    'game.waiting_start': '⏳ Ожидаем старт игры...',
    'game.locked_title': '🔒 <b>Билеты зафиксированы</b>',
    'game.starting': '⏳ Игра запускается...',
    'game.drawn_label': '🔢 Выпали',
    'game.results_title': 'РЕЗУЛЬТАТЫ',
    'game.winner_label': '🏆 Победитель',
    'game.winning_ticket': '🎟 Победный билет',
    'game.commission': '➖ Комиссия 5%',
    'game.payout': '💵 Выплата',
    'game.you_won': '🎉 <b>Поздравляем, вы выиграли!</b>',
    'game.no_winner': '😔 Победителя нет. Ставки возвращены.',
    'game.all_numbers': '🔢 Все числа ({count}): {drawn}',
    'game.again_hint': 'Нажмите «📋 Публичные столы» или «🎮 Создать стол», чтобы сыграть снова.',

    // Админка
    'adm.only': '⛔ Только для админов',
    'adm.title': '🛠 <b>Админ-панель</b>\n\nВыберите действие:',
    'adm.btn_stats': '📊 Статистика',
    'adm.btn_user': '👤 Инфо о юзере',
    'adm.btn_list': '📜 Последние юзеры',
    'adm.btn_add': '➕ Добавить баланс',
    'adm.btn_set': '💵 Установить баланс',
    'adm.btn_sub': '➖ Снять баланс',
    'adm.btn_ban': '🚫 Бан',
    'adm.btn_unban': '✅ Разбан',
    'adm.btn_tables': '🎮 Активные столы',
    'adm.btn_broadcast': '📢 Рассылка',
    'adm.btn_withdraws': '💸 Заявки на вывод',
    'adm.btn_msg': '✉️ Написать юзеру',
    'adm.btn_back': '« Назад в админку',
  },

  uz: {
    'menu.create_table': '🎮 Stol yaratish',
    'menu.public_tables': '📋 Ochiq stollar',
    'menu.balance': '💰 Balans',
    'menu.referrals': '👥 Referallar',
    'menu.deposit': '📥 To‘ldirish',
    'menu.withdraw': '📤 Yechib olish',
    'menu.instruction': '📖 Yo‘riqnoma',
    'menu.language': '🌐 Til',
    'menu.admin': '🛠 Admin',

    'lang.choose': '🌐 <b>Tilni tanlang / Выберите язык / Choose language</b>',
    'lang.changed': '✅ Til <b>O‘zbekcha</b> ga o‘zgartirildi',
    'start.welcome':
      '👋 <b>Lotereya Bot</b> ga xush kelibsiz!\n💰 Balans: <b>${balance}</b>\n\nQuyidagi menyudan amalni tanlang:',
    'start.referral_used': '\n\n✅ Siz <b>{name}</b> referal havolasi orqali ro‘yxatdan o‘tdingiz',
    'start.invite_in_game':
      '⚠️ Siz allaqachon boshqa stolda o‘tiribsiz va hozir havola orqali qo‘shila olmaysiz.',

    'instruction.text':
      '📖 <b>Lotereya Bot qanday o‘ynaladi</b>\n\n' +
      '🎮 <b>O‘yin haqida</b>\nLotereya Bot — bu 2–6 o‘yinchi bitta stolda raqobatlashadigan multiplayer lotereya. ' +
      'Har bir o‘yinchi bir yoki bir nechta chipta sotib oladi. Har bir chipta — 1 dan 30 gacha bo‘lgan 5 ta tasodifiy raqam.\n\n' +
      '🎯 <b>Raund qanday o‘tadi</b>\n' +
      '1. Stol yarating yoki ochiq/maxfiy stolga qo‘shiling.\n' +
      '2. Stavka, o‘yinchilar va chiptalar sonini tanlang.\n' +
      '3. Stol to‘lgach yoki yaratuvchi o‘yinni boshlagach, raqamlar har necha soniyada bittadan chiqadi.\n' +
      '4. Chiptasidagi 5 raqami birinchi bo‘lib chiqqan o‘yinchi butun bankni oladi (5% komissiya chegirib).\n\n' +
      '💰 <b>Stavka va chiptalar</b>\n' +
      '• Tezkor stavkalar: $1, $5, $10 yoki istalgan miqdor (butun dollar).\n' +
      '• Bir o‘yinchi uchun chiptalar: istalgan musbat son.\n' +
      '• Narx = stavka × chiptalar, qo‘shilishda balansdan yechiladi.\n\n' +
      '🏆 <b>Sovrinlar</b>\n• G‘olib bankni 5% komissiyadan tashqari oladi.\n• Agar raqamlar tugab, g‘olib bo‘lmasa — barcha stavkalar qaytariladi.\n\n' +
      '👥 <b>Referallar</b>\n• Do‘stlaringizni taklif qiling va har bir muvaffaqiyatli to‘ldirish uchun $0.05 oling.\n\n' +
      '📰 Yangiliklar uchun kanalimizga obuna bo‘ling!',
    'instruction.channel': '📰 Kanalga obuna',

    'ct.in_game': '⚠️ Siz allaqachon stoldasiz. O‘yin tugashini kuting.',
    'ct.step1': '🎮 Stol yaratish\n\n1) Stavkani tanlang:',
    'ct.btn_other': '💵 Boshqa miqdor',
    'ct.custom_bet_prompt':
      '💵 Stavkani butun dollarda kiriting (musbat butun son, tiyinsiz):',
    'ct.step2': '🎮 Stol yaratish\n\nStavka: <b>${bet}</b>\n\n2) O‘yinchilar sonini tanlang (2–6):',
    'ct.step3':
      '🎮 Stol yaratish\n\nStavka: <b>${bet}</b>\nO‘yinchilar: <b>{max}</b>\n\n3) Stol turini tanlang:',
    'ct.btn_public': '🌐 Ochiq',
    'ct.btn_private': '🔒 Maxfiy',
    'ct.type_public': '🌐 Ochiq',
    'ct.type_private': '🔒 Maxfiy',
    'ct.step4':
      '🎮 Stol yaratish\n\nStavka: <b>${bet}</b>\nO‘yinchilar: <b>{max}</b>\nTuri: <b>{type}</b>\n\n4) O‘zingiz uchun chiptalar sonini kiriting (musbat butun son):',
    'ct.tickets_prompt': '4) O‘zingiz uchun chiptalar sonini kiriting (musbat butun son):',
    'ct.invalid_int': '❌ Iltimos, musbat butun son kiriting. Qaytadan urining:',
    'ct.invalid_tickets': '❌ Iltimos, musbat butun son kiriting. Qaytadan urining:',
    'ct.created_private':
      '✅ Maxfiy stol yaratildi: <b>#{id}</b>\n💵 Stavka: <b>${bet}</b>\n👥 Maks: <b>{max}</b>\n\n🔗 Taklif havolasi:\n🔴 <code>{link}</code>',
    'ct.created_public':
      '✅ Ochiq stol yaratildi: <b>#{id}</b>\n💵 Stavka: <b>${bet}</b>\n👥 Maks: <b>{max}</b>\n\nU «📋 Ochiq stollar» ro‘yxatiga qo‘shildi.',

    'pt.empty': '📋 Hozir ochiq stollar yo‘q. Yangisini yarating!',
    'pt.title': '📋 <b>Ochiq stollar:</b>',
    'pt.btn': '#{id} | ${bet} | {players}/{max} o‘yinchi',
    'pt.unavailable': '❌ Stol mavjud emas',
    'pt.btn_back': '« Ro‘yxatga qaytish',
    'pt.join_prompt':
      '🎮 Stol #{id}\n💵 Stavka: <b>${bet}</b>\n👥 O‘yinchilar: <b>{players}/{max}</b>\n\nChiptalar sonini kiriting (musbat butun son):',
    'pt.private_prompt':
      '🔒 <b>Maxfiy stol #{id}</b>\n💵 Stavka: <b>${bet}</b>\n👥 O‘yinchilar: <b>{players}/{max}</b>\n\nChiptalar sonini kiriting (musbat butun son):',
    'pt.private_not_found': '❌ Maxfiy stol topilmadi yoki tugagan.',
    'pt.private_closed': '❌ Bu stol endi o‘yinchilar qabul qilmaydi.',

    'start_btn': '🚀 O‘yinni boshlash',
    'start.not_creator': '❌ O‘yinni faqat yaratuvchi boshlay oladi.',
    'start.not_enough': '❌ Boshlash uchun kamida 2 o‘yinchi kerak.',
    'start.unavailable': '❌ O‘yin allaqachon boshlangan yoki stol mavjud emas.',
    'start.fail': '❌ O‘yinni boshlash imkonsiz',
    'start.table_not_found': '❌ Stol topilmadi.',

    'err.in_game': '⚠️ Siz allaqachon boshqa stoldasiz.',
    'err.table_not_found': '❌ Stol topilmadi.',
    'err.table_unavailable': '❌ Bu stol endi mavjud emas.',
    'err.table_full': '❌ Stol allaqachon to‘lgan.',
    'err.private_only': '❌ Bu maxfiy stol. Faqat taklif havolasi orqali kiring.',
    'err.invalid_tickets': '❌ Chiptalar soni musbat butun son bo‘lishi kerak.',
    'err.invalid_bet': '❌ Stavka musbat butun son bo‘lishi kerak.',
    'err.already_in_table': '⚠️ Siz allaqachon shu stoldasiz.',
    'err.no_funds': '❌ Mablag‘ yetarli emas. Kamida <b>${needed}</b> kerak.',
    'err.join_fail': '❌ Stolga qo‘shilib bo‘lmadi.',

    'bal.title':
      '💰 <b>Balans</b>\n\n🏷 Ism: {name}\n💵 Balans: <b>${balance}</b>\n📊 Sarflangan: <b>${spent}</b>\n🎮 O‘yinlar: <b>{games}</b>\n🏆 G‘alabalar: <b>{wins}</b>',

    'ref.title':
      '👥 <b>Referal dasturi</b>\n\nDo‘stlaringizni taklif qiling va har bir muvaffaqiyatli to‘ldirish uchun <b>$0.05</b> oling.\n\n👤 Referallar: <b>{count}</b>\n💵 Topgan: <b>${earned}</b>\n\n🔗 Sizning havolangiz:\n<code>{link}</code>',

    'dep.title':
      '📥 <b>To‘ldirish</b>\n\n💰 Joriy balans: <b>${balance}</b>\n\nQuyidagi manzilga mablag‘ yuboring:\n<code>{address}</code>\n\nTo‘lovdan so‘ng tugmani bosing va miqdorni kiriting.',
    'dep.btn_paid': '✅ To‘ladim',
    'dep.fail': '❌ To‘ldirish so‘rovini yaratib bo‘lmadi.',
    'dep.amount_prompt': '💵 To‘ldirish miqdorini kiriting (masalan, 5 yoki 12.5):',
    'dep.invalid_amount': '❌ To‘g‘ri miqdor kiriting (0 dan katta son).',
    'dep.already': '⚠️ Bu so‘rov allaqachon qayta ishlangan.',
    'dep.expired': '❌ Sessiya tugadi. «📥 To‘ldirish» tugmasini qaytadan bosing.',
    'dep.fail_process': '❌ Qayta ishlab bo‘lmadi. Miqdorni tekshiring va qaytadan urining.',
    'dep.success': '✅ <b>To‘ldirish hisobga olindi</b>\n\n💵 Miqdor: <b>${amount}</b>\n💰 Yangi balans: <b>${balance}</b>',
    'dep.referral_reward': '\n\n👥 Referer mukofoti: <b>${amount}</b>',

    'wd.no_funds': '❌ Yechib olish uchun mablag‘ yo‘q.',
    'wd.address_prompt': '📤 <b>Yechib olish</b>\n\n💰 Balans: <b>${balance}</b>\n\nHamyon manzilini kiriting:',
    'wd.address_short': '❌ Manzil juda qisqa. To‘g‘ri manzilni kiriting:',
    'wd.amount_prompt': '📤 Manzil: <code>{address}</code>\n\nMiqdorni kiriting (maks <b>${max}</b>):',
    'wd.invalid_amount': '❌ To‘g‘ri miqdor kiriting (0 dan katta son):',
    'wd.success':
      '✅ <b>Yechib olish so‘rovi yaratildi</b>\n\n💵 Miqdor: <b>${amount}</b>\n📬 Manzil: <code>{address}</code>\n📋 Holat: <b>{status}</b>\n\n⏳ Mablag‘lar tez orada yuboriladi.',
    'wd.no_funds_alt': '❌ Balans yetarli emas.',
    'wd.invalid_amount_alt': '❌ Noto‘g‘ri miqdor.',
    'wd.invalid_address': '❌ Noto‘g‘ri manzil.',
    'wd.fail': '❌ So‘rov yaratilmadi.',
    'wd.notify_user':
      '📤 <b>Yechib olish so‘rovi</b>\n\n💵 Miqdor: <b>${amount}</b>\n📋 Holat: <b>{status}</b>\n\n{note}',
    'wd.approved_note': '✅ Yechib olishingiz tasdiqlandi va qayta ishlandi.',
    'wd.rejected_note': '❌ Yechib olishingiz rad etildi, mablag‘ balansga qaytarildi.',

    'banned': '🚫 Siz bloklangansiz va botdan foydalana olmaysiz.',
    'banned.short': '🚫 Siz bloklangansiz.',

    'game.you': ' (siz)',
    'game.waiting_title': '🎮 <b>Stol #{id} | ${bet}</b>',
    'game.privacy_pub': '🌐 Ochiq',
    'game.privacy_prv': '🔒 Maxfiy',
    'game.players_label': '👥 O‘yinchilar',
    'game.pot_label': '💰 Bank',
    'game.players_list_label': 'O‘yinchilar',
    'game.need_more_players': '⏳ Boshlash uchun kamida 2 o‘yinchi kerak.',
    'game.waiting_start': '⏳ O‘yin boshlanishini kutmoqda...',
    'game.locked_title': '🔒 <b>Chiptalar qulflandi</b>',
    'game.starting': '⏳ O‘yin boshlanmoqda...',
    'game.drawn_label': '🔢 Chiqdi',
    'game.results_title': 'NATIJALAR',
    'game.winner_label': '🏆 G‘olib',
    'game.winning_ticket': '🎟 G‘olib chipta',
    'game.commission': '➖ Komissiya 5%',
    'game.payout': '💵 To‘lov',
    'game.you_won': '🎉 <b>Tabriklaymiz, siz yutdingiz!</b>',
    'game.no_winner': '😔 G‘olib yo‘q. Stavkalar qaytarildi.',
    'game.all_numbers': '🔢 Barcha raqamlar ({count}): {drawn}',
    'game.again_hint': 'Yana o‘ynash uchun «📋 Ochiq stollar» yoki «🎮 Stol yaratish» tugmasini bosing.',

    'adm.only': '⛔ Faqat adminlar uchun',
    'adm.title': '🛠 <b>Admin paneli</b>\n\nAmalni tanlang:',
    'adm.btn_stats': '📊 Statistika',
    'adm.btn_user': '👤 Foydalanuvchi',
    'adm.btn_list': '📜 Oxirgi foydalanuvchilar',
    'adm.btn_add': '➕ Balans qo‘shish',
    'adm.btn_set': '💵 Balansni belgilash',
    'adm.btn_sub': '➖ Balansni yechish',
    'adm.btn_ban': '🚫 Ban',
    'adm.btn_unban': '✅ Banni olib tashlash',
    'adm.btn_tables': '🎮 Faol stollar',
    'adm.btn_broadcast': '📢 Xabar yuborish',
    'adm.btn_withdraws': '💸 Yechib olish so‘rovlari',
    'adm.btn_msg': '✉️ Foydalanuvchiga xabar',
    'adm.btn_back': '« Adminga qaytish',
  },

  en: {
    'menu.create_table': '🎮 Create table',
    'menu.public_tables': '📋 Public tables',
    'menu.balance': '💰 Balance',
    'menu.referrals': '👥 Referrals',
    'menu.deposit': '📥 Deposit',
    'menu.withdraw': '📤 Withdraw',
    'menu.instruction': '📖 Instruction',
    'menu.language': '🌐 Language',
    'menu.admin': '🛠 Admin',

    'lang.choose': '🌐 <b>Choose language / Выберите язык / Tilni tanlang</b>',
    'lang.changed': '✅ Language changed to <b>English</b>',
    'start.welcome':
      '👋 Welcome to <b>Lottery Bot</b>!\n💰 Balance: <b>${balance}</b>\n\nPick an action from the menu below:',
    'start.referral_used': '\n\n✅ You signed up via referral from <b>{name}</b>',
    'start.invite_in_game':
      '⚠️ You are already at another table and cannot join via link right now.',

    'instruction.text':
      '📖 <b>How to play Lottery Bot</b>\n\n' +
      '🎮 <b>The game</b>\nLottery Bot is a multiplayer lottery where 2–6 players compete at one table. ' +
      'Every player buys one or more tickets. Each ticket is a random set of 5 numbers from 1 to 30.\n\n' +
      '🎯 <b>How a round works</b>\n' +
      '1. Create a table or join a public/private one.\n' +
      '2. Choose your bet, number of players and tickets.\n' +
      '3. When the table is full or the creator starts the game, numbers are drawn one by one every couple of seconds.\n' +
      '4. The first player whose ticket has all 5 numbers drawn wins the whole pot (minus a small 5% commission).\n\n' +
      '💰 <b>Bets &amp; tickets</b>\n' +
      '• Quick bet options: $1, $5, $10, or any custom whole-dollar amount.\n' +
      '• Tickets per player: any positive integer.\n' +
      '• Cost = bet × tickets, deducted from your balance when joining.\n\n' +
      '🏆 <b>Prizes</b>\n• Winner takes the pot minus 5% commission.\n• If the deck is exhausted with no winner, all bets are refunded.\n\n' +
      '👥 <b>Referrals</b>\n• Invite friends and earn $0.05 per successful deposit they make.\n\n' +
      '📰 Stay tuned to our channel for news and updates!',
    'instruction.channel': '📰 Follow the channel',

    'ct.in_game': '⚠️ You are already at a table. Wait for the game to finish.',
    'ct.step1': '🎮 Create a table\n\n1) Choose a bet:',
    'ct.btn_other': '💵 Other amount',
    'ct.custom_bet_prompt':
      '💵 Enter your custom bet in whole dollars (positive integer, no cents):',
    'ct.step2': '🎮 Create a table\n\nBet: <b>${bet}</b>\n\n2) Choose number of players (2–6):',
    'ct.step3':
      '🎮 Create a table\n\nBet: <b>${bet}</b>\nPlayers: <b>{max}</b>\n\n3) Choose table type:',
    'ct.btn_public': '🌐 Public',
    'ct.btn_private': '🔒 Private',
    'ct.type_public': '🌐 Public',
    'ct.type_private': '🔒 Private',
    'ct.step4':
      '🎮 Create a table\n\nBet: <b>${bet}</b>\nPlayers: <b>{max}</b>\nType: <b>{type}</b>\n\n4) Enter the number of tickets for yourself (positive integer):',
    'ct.tickets_prompt': '4) Enter the number of tickets for yourself (positive integer):',
    'ct.invalid_int': '❌ Please enter a positive whole number. Try again:',
    'ct.invalid_tickets': '❌ Please enter a positive whole number of tickets. Try again:',
    'ct.created_private':
      '✅ Private table created: <b>#{id}</b>\n💵 Bet: <b>${bet}</b>\n👥 Max players: <b>{max}</b>\n\n🔗 Invite link:\n🔴 <code>{link}</code>',
    'ct.created_public':
      '✅ Public table created: <b>#{id}</b>\n💵 Bet: <b>${bet}</b>\n👥 Max players: <b>{max}</b>\n\nIt is now listed in «📋 Public tables».',

    'pt.empty': '📋 There are no public tables right now. Create a new one!',
    'pt.title': '📋 <b>Public tables:</b>',
    'pt.btn': '#{id} | ${bet} | {players}/{max} players',
    'pt.unavailable': '❌ Table unavailable',
    'pt.btn_back': '« Back to list',
    'pt.join_prompt':
      '🎮 Table #{id}\n💵 Bet: <b>${bet}</b>\n👥 Players: <b>{players}/{max}</b>\n\nEnter the number of tickets you want to buy (positive integer):',
    'pt.private_prompt':
      '🔒 <b>Private table #{id}</b>\n💵 Bet: <b>${bet}</b>\n👥 Players: <b>{players}/{max}</b>\n\nEnter the number of tickets (positive integer):',
    'pt.private_not_found': '❌ Private table not found or already finished.',
    'pt.private_closed': '❌ This table is no longer accepting players.',

    'start_btn': '🚀 Start game',
    'start.not_creator': '❌ Only the creator can start the game.',
    'start.not_enough': '❌ At least 2 players are required to start.',
    'start.unavailable': '❌ The game is already running or the table is unavailable.',
    'start.fail': '❌ Failed to start the game',
    'start.table_not_found': '❌ Table not found.',

    'err.in_game': '⚠️ You are already at another table.',
    'err.table_not_found': '❌ Table not found.',
    'err.table_unavailable': '❌ This table is no longer available.',
    'err.table_full': '❌ The table is already full.',
    'err.private_only': '❌ This is a private table. Join only via invite link.',
    'err.invalid_tickets': '❌ Ticket count must be a positive integer.',
    'err.invalid_bet': '❌ Bet must be a positive integer.',
    'err.already_in_table': '⚠️ You are already at this table.',
    'err.no_funds': '❌ Insufficient funds. You need at least <b>${needed}</b>.',
    'err.join_fail': '❌ Failed to join the table.',

    'bal.title':
      '💰 <b>Balance</b>\n\n🏷 Name: {name}\n💵 Balance: <b>${balance}</b>\n📊 Spent: <b>${spent}</b>\n🎮 Games played: <b>{games}</b>\n🏆 Wins: <b>{wins}</b>',

    'ref.title':
      '👥 <b>Referral program</b>\n\nInvite friends and earn <b>$0.05</b> per successful deposit.\n\n👤 Referrals: <b>{count}</b>\n💵 Earned: <b>${earned}</b>\n\n🔗 Your link:\n<code>{link}</code>',

    'dep.title':
      '📥 <b>Deposit</b>\n\n💰 Current balance: <b>${balance}</b>\n\nSend funds to this address:\n<code>{address}</code>\n\nAfter paying, tap the button below and enter the amount.',
    'dep.btn_paid': '✅ I have paid',
    'dep.fail': '❌ Failed to create deposit request.',
    'dep.amount_prompt': '💵 Enter the deposit amount (e.g. 5 or 12.5):',
    'dep.invalid_amount': '❌ Please enter a valid amount (number greater than 0).',
    'dep.already': '⚠️ This deposit has already been processed.',
    'dep.expired': '❌ Deposit session expired. Tap «📥 Deposit» again.',
    'dep.fail_process': '❌ Failed to process the deposit. Check the amount and try again.',
    'dep.success': '✅ <b>Deposit credited</b>\n\n💵 Amount: <b>${amount}</b>\n💰 New balance: <b>${balance}</b>',
    'dep.referral_reward': '\n\n👥 Referrer reward: <b>${amount}</b>',

    'wd.no_funds': '❌ You have no funds to withdraw.',
    'wd.address_prompt': '📤 <b>Withdraw</b>\n\n💰 Balance: <b>${balance}</b>\n\nEnter your wallet address:',
    'wd.address_short': '❌ Address is too short. Enter a valid wallet address:',
    'wd.amount_prompt': '📤 Address: <code>{address}</code>\n\nEnter the amount (max <b>${max}</b>):',
    'wd.invalid_amount': '❌ Please enter a valid amount (number greater than 0):',
    'wd.success':
      '✅ <b>Withdrawal request created</b>\n\n💵 Amount: <b>${amount}</b>\n📬 Address: <code>{address}</code>\n📋 Status: <b>{status}</b>\n\n⏳ Funds will be sent shortly.',
    'wd.no_funds_alt': '❌ Insufficient balance.',
    'wd.invalid_amount_alt': '❌ Invalid amount.',
    'wd.invalid_address': '❌ Invalid address.',
    'wd.fail': '❌ Failed to create the request.',
    'wd.notify_user':
      '📤 <b>Withdrawal request</b>\n\n💵 Amount: <b>${amount}</b>\n📋 Status: <b>{status}</b>\n\n{note}',
    'wd.approved_note': '✅ Your withdrawal has been approved and processed.',
    'wd.rejected_note': '❌ Your withdrawal was rejected, funds returned to balance.',

    'banned': '🚫 You are banned from using this bot.',
    'banned.short': '🚫 You are banned.',

    'game.you': ' (you)',
    'game.waiting_title': '🎮 <b>Table #{id} | ${bet}</b>',
    'game.privacy_pub': '🌐 Public',
    'game.privacy_prv': '🔒 Private',
    'game.players_label': '👥 Players',
    'game.pot_label': '💰 Pot',
    'game.players_list_label': 'Players',
    'game.need_more_players': '⏳ At least 2 players are required to start.',
    'game.waiting_start': '⏳ Waiting for the game to start...',
    'game.locked_title': '🔒 <b>Tickets locked</b>',
    'game.starting': '⏳ The game is starting...',
    'game.drawn_label': '🔢 Drawn',
    'game.results_title': 'RESULTS',
    'game.winner_label': '🏆 Winner',
    'game.winning_ticket': '🎟 Winning ticket',
    'game.commission': '➖ Commission 5%',
    'game.payout': '💵 Payout',
    'game.you_won': '🎉 <b>Congratulations, you won!</b>',
    'game.no_winner': '😔 No winner. Bets have been refunded.',
    'game.all_numbers': '🔢 All numbers ({count}): {drawn}',
    'game.again_hint': 'Tap «📋 Public tables» or «🎮 Create table» to play again.',

    'adm.only': '⛔ Admins only',
    'adm.title': '🛠 <b>Admin panel</b>\n\nChoose an action:',
    'adm.btn_stats': '📊 Stats',
    'adm.btn_user': '👤 User info',
    'adm.btn_list': '📜 Recent users',
    'adm.btn_add': '➕ Add balance',
    'adm.btn_set': '💵 Set balance',
    'adm.btn_sub': '➖ Deduct balance',
    'adm.btn_ban': '🚫 Ban',
    'adm.btn_unban': '✅ Unban',
    'adm.btn_tables': '🎮 Active tables',
    'adm.btn_broadcast': '📢 Broadcast',
    'adm.btn_withdraws': '💸 Withdraw requests',
    'adm.btn_msg': '✉️ Message user',
    'adm.btn_back': '« Back to admin',
  },
};

function normalizeLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

function t(lang, key, params = {}) {
  const code = normalizeLang(lang);
  let str = (TRANSLATIONS[code] && TRANSLATIONS[code][key]) || TRANSLATIONS[DEFAULT_LANG][key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.split(`{${k}}`).join(String(v));
  }
  return str;
}

module.exports = {
  SUPPORTED_LANGS,
  DEFAULT_LANG,
  LANG_NAMES,
  t,
  normalizeLang,
};
