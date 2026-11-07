/**
 * Русский словарь интерфейса.
 *
 * Ключи плоские и сгруппированы по экранам: app - оболочка, catalog -
 * каталог, workspace - рабочая область, measures/pieces - панели, export -
 * выгрузка, sizes - размерная сетка, preview3d - 3D.
 *
 * Подстановка: {name} заменяется на значение.
 */
export const ru = {
	'project.showErrors': 'Ошибки: {count} — показать',

	'project.changedDuringSave': 'Модель изменилась во время проверки. Сохраните её ещё раз.',

	'project.myDesigns': 'Мои модели',
	'project.scope': 'Создайте свою модель на основе футболки, рубашки, брюк или юбки. Меняйте мерки, фасон и доступные точки конструкции.',
	'project.base': 'Основа для новой модели',
	'project.create': 'Создать модель',
	'project.import': 'Импорт проекта JSON',
	'project.delete': 'Удалить',
	'project.empty': 'Сохранённых моделей пока нет. Создайте модель и сохраните её в редакторе.',
	'project.title': 'Моя модель',
	'project.name': 'Название модели',
	'project.save': 'Сохранить',
	'project.duplicate': 'Сохранить копию',
	'project.undo': 'Отменить',
	'project.redo': 'Повторить',
	'project.export': 'Скачать проект JSON',
	'project.exportShort': 'Экспорт',
	'project.local': 'Проекты хранятся в этом браузере. Скачайте JSON для резервной копии или переноса. PDF лекал находится в панели печати.',
	'project.unsaved': 'Есть несохранённые изменения.',
	'project.saved': 'Модель сохранена.',
	'project.invalid': 'Проект содержит недопустимые данные или ошибки построения. Проверьте мерки и параметры.',
	'project.storageError': 'Не удалось прочитать или сохранить проекты в браузере. Проверьте хранилище сайта.',
	'project.loadError': 'Модель не найдена или повреждена. Исходная основа оставлена без изменений.',
	'project.defaultName': 'Моя модель: {model}',
	'project.shape': 'Моделирование конструкции',
	'project.shapeHint': 'Координаты в сантиметрах: плечо — от оси детали, пройма — от верхней точки чертежа. Можно также перетаскивать точки на поле.',
	'project.shoulder_tip_x': 'Положение плечевой точки, см',
	'project.armhole_depth': 'Глубина проймы, см',
	'project.resetShape': 'Сбросить правки точек',
	'project.files': 'Прикреплённые файлы',
	'project.attachFile': 'Прикрепить PDF/SVG/DXF',
	'project.deleteFile': 'Удалить',
	'project.noFiles': 'Нет прикреплённых файлов.',
	'project.fileTooLarge': 'Файл слишком большой. Максимальный размер: 1 МБ.',
	'project.fileInvalidType': 'Поддерживаются только файлы PDF, SVG и DXF.',

	'onboarding.title': 'Как работает Shityo',
	'onboarding.step1': 'Подставьте мерки клиента в левой панели. Главная мерка регулируется слайдером.',
	'onboarding.step2': 'Сравните длины швов в правой панели: выберите две стороны A и B.',
	'onboarding.step3': 'Настройте бумагу и масштаб, затем скачайте PDF для печати 1:1.',
	'onboarding.start': 'Начать',
	'onboarding.skip': 'Пропустить',

	'workspace.measuresShort': 'Мерки',
	'workspace.inspectorShort': 'Печать и швы',
	'workspace.focusShort': 'Фокус',
	'workspace.restoreShort': 'Развернуть',

	'canvas.foldLine': 'Сгиб',
	'canvas.grainShort': 'ДН',

	'app.settings': 'Настройки',
	'app.close': 'Закрыть',
	'workspace.hideMeasures': 'Скрыть мерки',
	'workspace.showMeasures': 'Мерки и фасон',
	'workspace.hideInspector': 'Скрыть проверку и печать',
	'workspace.showInspector': 'Проверка и печать',
	'workspace.focus': 'Развернуть лекала',
	'workspace.inspector': 'Проверка и печать',
	'measures.circumferences': 'Обхваты',
	'measures.shoulder': 'Плечо и рукав',
	'measures.lengths': 'Длины и высоты',
	'inspect.title': 'Измерение швов',
	'inspect.seam': 'Шов',
	'inspect.choose': 'Выберите два шва',
	'inspect.first': 'Первый',
	'inspect.second': 'Второй',
	'inspect.cm': 'см',
	'inspect.difference': 'Разница',
	'inspect.pair': '{a} — {b}',
	'inspect.abHint': 'A и B: две стороны для сравнения',
	'inspect.hint': 'Длина по линии шва, без припуска. Разница может быть предусмотрена припосадкой. Выбранные швы подсвечены на чертеже.',
	'clients.title': 'Мерки клиента',
	'clients.choose': 'Выберите профиль',
	'clients.profile': 'Профиль',
	'clients.name': 'Имя клиента / название',
	'clients.apply': 'Применить',
	'clients.delete': 'Удалить',
	'clients.save': 'Сохранить мерки',
	'clients.namePlaceholder': 'Например, Анна К.',
	'clients.nameRequired': 'Введите имя, чтобы сохранить мерки.',
	'clients.local': 'Хранятся только в этом браузере. Каждое сохранение создаёт новую запись в истории клиента.',
	'clients.saved': 'Мерки сохранены.',
	'clients.applied': 'Мерки применены.',
	'clients.partial': 'Применены доступные мерки. Проверьте остальные поля для этой модели.',
	'clients.deleted': 'Профиль удалён.',
	'clients.storageError': 'Не удалось открыть хранилище браузера. Проверьте его настройки.',
	'clients.invalid': 'Исправьте мерки вне допустимых диапазонов перед сохранением.',
	'clients.client': 'Клиент',
	'clients.chooseClient': 'Выберите клиента',
	'clients.snapshot': 'Запись мерок',
	'clients.chooseSnapshot': 'Выберите запись',
	'clients.notes': 'Заметки',
	'clients.newSnapshotLabel': 'Метка записи',
	'clients.newSnapshotPlaceholder': 'Например, 15.05.2024',
	'clients.saveSnapshot': 'Сохранить текущие мерки',
	'clients.saveNotes': 'Сохранить заметки',
	'clients.createClient': 'Создать клиента',
	'clients.deleteClient': 'Удалить клиента',
	'clients.deleteSnapshot': 'Удалить запись',
	'clients.created': 'Клиент создан.',
	'clients.notesSaved': 'Заметки сохранены.',
	'clients.snapshotDeleted': 'Запись удалена.',
	'canvas.ruler': 'Линейка',
	'canvas.rulerHint': 'Нажмите две точки на поле. Esc — завершить.',
	'canvas.legend': 'Линии и масштаб',
	'canvas.baseLine': 'Линия шва / базовый контур',
	'canvas.cutLine': 'Срез с припуском',
	'canvas.gridNote': 'Сетка 5 × 5 см. Масштаб на экране условный; линейка измеряет в сантиметрах лекала.',

	'print.title': "Печать лекал",
	'print.toolbar': "Печать 1:1",
	'print.paper': "Бумага",
	'print.orientation': "Ориентация",
	'print.portrait': "Книжная",
	'print.landscape': "Альбомная",
	'print.full': "Один лист для плоттера",
	'print.calibration': "Контрольный лист 50 × 50 мм",
	'print.loading': "Считаем листы…",
	'print.count': "Всего листов: {count}",
	'print.patternCount': "С деталями: {count}",
	'print.open': "Открыть PDF для печати",
	'print.download': "Скачать PDF",
	'print.scale': "Печатайте в масштабе 100%. Отключите «Вписать в страницу».",
	'print.assembly': "Схема склейки",
	'print.overlap': "Нахлёст {value} мм · поля {margin} мм",
	'print.editors': "Для векторного редактора и САПР",
	'print.unavailable': "Не удалось рассчитать печать: {reason}",
	'print.pending': "Сначала дождитесь корректного построения лекала.",
	'print.svgHint': "SVG содержит все листы. Для печати из браузера используйте PDF.",
	'print.layout': "{rows} × {columns} листов",
	'print.size': "Лист {width} × {height} мм",
	'print.guide': "Начните с контрольного листа: обе стороны квадрата должны быть ровно 50 мм.",
	'print.dxf': "DXF для плоттера",
	'print.svg': "SVG для печати",
	'print.export': "Экспорт",

	// Оболочка
	'app.title': 'Конструктор лекал',
	'app.language': 'Язык',
	'app.languageRu': 'Русский',
	'app.languageEn': 'Английский',
	'app.theme': 'Тема',
	'app.themeLight': 'Светлая',
	'app.themeDark': 'Тёмная',

	// Каталог
	'catalog.title': 'Каталог лекал',
	'catalog.lead':
		'Возьмите основу под заказ, подставьте мерки клиента и выгрузите лекала в SVG, DXF или PDF.',
	'catalog.offline': 'Бэкенд недоступен — показаны локальные примеры.',
	'catalog.model': 'Основа',
	'catalog.pieces': 'Деталей',
	'catalog.measures': 'Мерок',
	'catalog.gender': 'Пол',
	'catalog.open': 'Открыть лекало',

	// Рабочая область
	'workspace.model': 'Модель',
	'workspace.layers': 'Слои',
	'workspace.layerSeam': 'Припуск на швы',
	'workspace.layerGrain': 'Долевая линия',
	'workspace.layerNotches': 'Надсечки',
	'workspace.layerInternal': 'Внутренние линии',
	'workspace.regenerate': 'Пересчитать',
	'workspace.ready': 'Готово',
	'workspace.calculating': 'Пересчёт…',
	'workspace.offline': 'офлайн-данные',
	'workspace.show3d': '3D-превью',
	'workspace.hide3d': 'Скрыть 3D',

	// Мерки и параметры
	'measures.title': 'Мерки, см',
	'measures.empty': 'Модель не задаёт мерок.',
	'params.title': 'Параметры фасона',
	'params.empty': 'У модели нет параметров фасона.',

	// Детали
	'pieces.title': 'Детали',
	'pieces.frontWidth': 'Ширина переда',
	'pieces.empty': 'Нет построенных деталей.',
	'pieces.dimensions': '{width} × {height} {unit}',
	'pieces.area': '{area} {unit}²',
	'pieces.mirrored': 'з.',
	'unit.cm': 'см',
	'unit.mm': 'мм',

	// Названия рёбер деталей: швы, по которым детали сшиваются
	'edge.бок': 'бок',
	'edge.боковой шов': 'боковой шов',
	'edge.манжета': 'манжета',
	'edge.низ': 'низ',
	'edge.окат': 'окат',
	'edge.планка': 'планка',
	'edge.плечо': 'плечо',
	'edge.подмышка': 'подмышка',
	'edge.пройма': 'пройма',
	'edge.сгиб': 'сгиб',
	'edge.сгиб воротника': 'сгиб воротника',
	'edge.середина спинки': 'середина спинки',

	// Ошибки клиента
	'issue.app.request_failed': 'Не удалось получить данные с сервера: {reason}',

	// Замечания валидатора: ключ - код из backend/app/core/issues.py
	'issue.draft.no_pieces': 'лекало не содержит ни одной детали',
	'issue.draft.unknown_model': 'Неизвестная модель: {model}',
	'issue.draft.missing_measurements': 'Не хватает мерок: {measurements}',
	'issue.draft.no_size_grid': 'Нет размерной сетки для модели: {model}',
	'issue.draft.build_failed': 'Не удалось построить лекало: {reason}',
	'issue.contour.too_few_points':
		'{piece}: контур из {count} точек, построить деталь нельзя',
	'issue.contour.not_closed':
		'{piece}: контур не замкнут, разрыв между первой и последней точкой {gap} мм',
	'issue.contour.self_intersecting': '{piece}: контур самопересекается',
	'issue.contour.not_simple': '{piece}: контур не образует простой многоугольник',
	'issue.contour.zero_area': '{piece}: площадь детали равна нулю',
	'issue.seam.allowance.missing': '{piece}: не задан припуск на швы',
	'issue.seam.allowance.not_number': '{piece}: припуск на швы задан не числом: {value}',
	'issue.seam.allowance.too_small':
		'{piece}: припуск на швы {value} мм должен быть больше нуля',
	'issue.seam.allowance.too_large':
		'{piece}: припуск на швы {value} мм больше допустимых {max} мм',
	'issue.seam.length_mismatch':
		'{piece_a}/{edge_a} и {piece_b}/{edge_b} не совпадают по длине: {length_a} мм против {length_b} мм',
	'issue.grainline.missing': '{piece}: не задана доля (линия зерна)',
	'issue.grainline.degenerate': '{piece}: доля вырождена в точку',
	'issue.grainline.deviation':
		'{piece}: доля отклонена от длинной стороны детали на {angle}°',
	'issue.measure.not_number': 'мерка «{name}» задана не числом: {value}',
	'issue.measure.out_of_range':
		'мерка «{name}» = {value} см вне диапазона {low}..{high} см',
	'issue.measure.not_positive': 'мерка «{name}» = {value} см должна быть больше нуля',
	'issue.param.not_number': 'параметр «{name}» задан не числом: {value}',
	'issue.param.out_of_range':
		'параметр «{name}» = {value} см вне диапазона {low}..{high} см',

	// Проверка лекала
	'check.title': 'Проверка лекала',
	'check.ok': 'Ошибок и предупреждений нет.',
	'check.errors': 'Ошибки',
	'check.warnings': 'Предупреждения',

	// Экспорт
	'export.title': 'Экспорт',
	'export.hint': 'Файлы 1:1 мм: SVG и PDF на листах A4/A3, DXF в формате AAMA/ASTM.',
	'export.svg': 'SVG',
	'export.dxf': 'DXF',
	'export.pdf': 'PDF',

	// Размерная сетка
	'sizes.title': 'Размерная сетка',
	'sizes.empty': 'Сетка размеров недоступна.',
	'sizes.size': 'Размер',
	'sizes.width': 'Ширина',
	'sizes.apply': 'Применить',

	// Холст лекал
	'canvas.zoomIn': 'Приблизить',
	'canvas.zoomOut': 'Отдалить',
	'canvas.fit': 'Вписать в окно',
	'canvas.handle': 'Точка редактора: тяните, чтобы изменить лекало',
	'canvas.ariaLabel': 'Чертёж лекал',

	// 3D
	'preview3d.badge': 'Геометрическое превью',
	'preview3d.hint':
		'Ткань посчитана нашим XPBD-солвером, но это драпировка по сетке, а не промышленная примерка: посадку по фигуре она не гарантирует.',
	'preview3d.failed': 'Не удалось построить 3D-сцену (WebGL недоступен).',

	// Названия мерок
	'measure.bust': 'Обхват груди',
	'measure.chest': 'Обхват груди',
	'measure.chest_circumference': 'Обхват груди',
	'measure.waist': 'Обхват талии',
	'measure.hip': 'Обхват бёдер',
	'measure.height': 'Рост',
	'measure.shoulder_width': 'Ширина плеча',
	'measure.shoulder_slope': 'Наклон плеча, °',
	'measure.back_length': 'Длина спинки',
	'measure.front_length': 'Длина переда',
	'measure.sleeve_length': 'Длина рукава',
	'measure.biceps': 'Обхват бицепса',
	'measure.neck_circumference': 'Обхват шеи',
	'measure.neck_to_waist': 'Длина от шеи до талии',
	'measure.waist_to_armpit': 'Длина от талии до подмышки',
	'measure.waist_to_hip': 'Длина от талии до бёдер',
	'measure.crotch_depth': 'Глубина шагового шва',
	'measure.inseam_length': 'Шаговой шов',
	'measure.knee_length': 'Длина до колена',
	'measure.knee_circumference': 'Обхват колена',
	'measure.skirt_length': 'Длина юбки',
	'measure.half_neck': 'Полуобхват шеи',
	'measure.half_bust': 'Полуобхват груди',
	'measure.half_waist': 'Полуобхват талии',
	'measure.half_hip': 'Полуобхват бёдер',
	'measure.back_waist_length': 'Длина спинки до талии',
	'measure.front_waist_length': 'Длина переда до талии',
	'measure.back_width': 'Ширина спины',
	'measure.chest_width': 'Ширина груди',
	'measure.shoulder_length': 'Длина плеча',
	'measure.bust_height': 'Высота груди',
	'measure.bust_center': 'Центр груди',
	'measure.armhole_depth': 'Глубина проймы',
	'measure.garment_length': 'Длина изделия',
	'measure.ease_bust': 'Прибавка по груди',
	'measure.ease_waist': 'Прибавка по талии',
	'measure.ease_length': 'Прибавка по длине',
	'measure.flare': 'Расклёшение',

	// Короткие подписи мерок для узкой таблицы
	'measure.bust.short': 'Грудь',
	'measure.waist.short': 'Талия',
	'measure.hip.short': 'Бёдра',
	'measure.height.short': 'Рост',

	// Габариты деталей
	'dimension.width': 'ширина',
	'dimension.height': 'высота',

	// Названия параметров
	'param.fit': 'Посадка',
	'param.neckline': 'Горловина',
	'param.sleeve_length': 'Длина рукава',
	'param.length_delta': 'Изменение длины',
	'param.ease_bust': 'Прибавка по груди',
	'param.ease_waist': 'Прибавка по талии',
	'param.ease_hip': 'Прибавка по бёдрам',
	'param.ease_length': 'Прибавка по длине',
	'param.flare': 'Расклёшение',
	'param.flare_ratio': 'Расклешение (доля от длины)',

	// Варианты параметров-выборов
	'param.fit.slim': 'Прилегающий',
	'param.fit.regular': 'Классический',
	'param.fit.loose': 'Свободный',
	'param.fit.oversize': 'Оверсайз',
	'param.neckline.crew': 'Круглая',
	'param.neckline.v': 'V-образная',
	'param.neckline.square': 'Квадратная',
	'param.neckline.scoop': 'Лодочка',
	'param.neckline.stand': 'Стойка',

	// Названия деталей лекал
	'piece.front': 'Перед',
	'piece.back': 'Спинка',
	'piece.sleeve': 'Рукав',
	'piece.collar': 'Воротник',
	'piece.skirt': 'Юбка',
	'piece.pocket': 'Карман',
	'piece.placket': 'Планка',

	// Модели: название, подпись категории, описание, назначение и мерки
	'model.tee.name': 'Футболка',
	'model.tee.category': 'Трикотаж',
	'model.tee.description':
		'Базовая футболка с круглой горловиной, раздельные перед и спинка, рукав по окату.',
	'model.tee.suitable': 'Повседневные футболки и лонгсливы из трикотажа.',
	'model.tee.measurements':
		'Обхват груди, талии и бёдер, рост, ширина и наклон плеча, длина спинки и рукава, обхват шеи и бицепса.',

	'model.shirt.name': 'Рубашка',
	'model.shirt.category': 'Рубашки',
	'model.shirt.description':
		'Рубашка с отложным воротником, манжетами и вытачками по талии.',
	'model.shirt.suitable': 'Классические и полуприлегающие рубашки с воротником и манжетами.',
	'model.shirt.measurements':
		'Обхват груди, талии и бёдер, рост, ширина и наклон плеча, длина спинки и рукава, обхват шеи и бицепса.',

	'model.trousers.name': 'Брюки',
	'model.trousers.category': 'Брюки',
	'model.trousers.description':
		'Классические брюки со стрелками: передняя и задняя штанина.',
	'model.trousers.suitable': 'Брюки со стрелками, чиносы и классические брюки.',
	'model.trousers.measurements':
		'Обхват талии и бёдер, рост, глубина шага, шаговый шов, длина до колена, обхват колена.',

	'model.skirt.name': 'Юбка',
	'model.skirt.category': 'Юбки',
	'model.skirt.description':
		'Юбка с расклешением подола и сгибом посередине.',
	'model.skirt.suitable': 'Прямые и расклешённые юбки на талии.',
	'model.skirt.measurements':
		'Обхват талии и бёдер, рост, длина от талии до бёдер, длина юбки.',
	'model.dress.name': 'Платье-футляр',
	'model.dress.category': 'Платья',
	'model.dress.description':
		'Базовое платье-футляр без рукавов с прилегающим силуэтом.',
	'model.dress.suitable': 'Платья-футляры и облегающие силуэты без рукавов.',
	'model.dress.measurements':
		'Полуобхваты шеи, груди, талии и бёдер, длины до талии спинки и переда, длина плеча, высота и центр груди, глубина проймы и длина изделия.',
	'model.vest.name': 'Жилет',
	'model.vest.category': 'Верх',
	'model.vest.description':
		'Базовый жилет без рукавов с V-образным вырезом горловины.',
	'model.vest.suitable': 'Жилеты и безрукавки с подгонкой по талии.',
	'model.vest.measurements':
		'Полуобхваты шеи, груди, талии и бёдер, длины до талии спинки и переда, длина плеча, высота и центр груди, глубина проймы и длина от талии до бёдер.',
	'model.coat.name': 'Пальто/плащ',
	'model.coat.category': 'Верхняя одежда',
	'model.coat.description':
		'Простое пальто или плащ с длинным рукавом и отложным воротником.',
	'model.coat.suitable': 'Пальто и плащи с рукавами, надеваемые поверх одежды.',
	'model.coat.measurements':
		'Полуобхваты шеи, груди, талии и бёдер, длины до талии спинки и переда, длина плеча, высота и центр груди, глубина проймы, длина изделия, длина рукава и обхват бицепса.',

	// Главная страница / лендинг
	'landing.hero.title': 'Конструктор лекал для портных и ателье',
	'landing.hero.lead':
		'Берите классическую основу, вводите мерки клиента и выгружайте лекала в PDF, SVG или DXF для плоттера. Никаких внешних ссылок: всё строится в редакторе.',
	'landing.hero.cta': 'Создать футболку',
	'landing.hero.more': 'Смотреть основы',
	'landing.advantages.title': 'Почему Shityo',
	'landing.advantage.measurements.title': 'Мерки клиента',
	'landing.advantage.measurements.text':
		'Строите не по стандартному размеру, а по обхватам, длинам и пропорциям конкретного человека.',
	'landing.advantage.seams.title': 'Проверка швов',
	'landing.advantage.seams.text':
		'Сравнивайте длины сопряжённых швов до раскроя, чтобы избежать перекосов на ткани.',
	'landing.advantage.export.title': 'Печать 1:1 и файлы для плоттера',
	'landing.advantage.export.text':
		'PDF на листах A4/A3, SVG для печати и DXF в формате AAMA/ASTM для промышленного оборудования.',
	'landing.bases.title': 'Классические базовые конструкции',
	'landing.bases.hint':
		'Четыре основы, которые покрывают большинство индивидуальных заказов. Каждая редактируется по меркам и параметрам фасона.',
	'landing.bases.suitable': 'Подходит для',
	'landing.bases.measurements': 'Нужные мерки',
	'landing.pricing.title': 'Тарифы',
	'landing.pricing.start.name': 'Старт',
	'landing.pricing.start.price': 'Бесплатно',
	'landing.pricing.start.cta': 'Начать',
	'landing.pricing.start.feature.1': '4 базовые конструкции',
	'landing.pricing.start.feature.2': 'PDF-печать 1:1',
	'landing.pricing.start.feature.3': 'Сохранение проектов в браузере',
	'landing.pricing.start.feature.4': 'Один пользователь',
	'landing.pricing.pro.name': 'Профи',
	'landing.pricing.pro.price': '990 ₽/мес',
	'landing.pricing.pro.cta': 'Подключить',
	'landing.pricing.pro.feature.1': 'Всё из «Старта»',
	'landing.pricing.pro.feature.2': 'Экспорт SVG и DXF',
	'landing.pricing.pro.feature.3': 'Профили клиентов и история мерок',
	'landing.pricing.pro.feature.4': 'Приоритетная генерация',
	'landing.pricing.atelier.name': 'Ателье',
	'landing.pricing.atelier.price': 'По запросу',
	'landing.pricing.atelier.cta': 'Написать',
	'landing.pricing.atelier.feature.1': 'Всё из «Профи»',
	'landing.pricing.atelier.feature.2': 'Команда и общие проекты',
	'landing.pricing.atelier.feature.3': 'API и интеграции',
	'landing.pricing.atelier.feature.4': 'Поддержка при внедрении',
	'landing.pricing.note':
		'Оплата пока не подключена. «Профи» и «Ателье» будут доступны после запуска платежей.',

	// Галерея иконок
	'icons.title': 'Иконки',
	'icons.lead':
		'Иконки из набора lucide, которые уже подключены к интерфейсу. Нажмите на иконку, чтобы скопировать её имя.',
	'icons.search': 'Поиск иконки',
	'icons.copy': 'Скопировать имя',
	'icons.copied': 'Скопировано',
	'icons.found': 'Найдено',
	'icons.group.interface': 'Интерфейс',
	'icons.group.pattern': 'Лекало',
	'icons.group.view': 'Вид',
	'icons.group.actions': 'Действия',
	'icons.group.data': 'Данные и текст',
	'icons.group.arrows': 'Стрелки',

	// Категории и пол
	'gender.male': 'Мужской',
	'gender.female': 'Женский',
	'gender.kids': 'Детский',
	'gender.unisex': 'Унисекс',
};
