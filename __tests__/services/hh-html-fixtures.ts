// P18: HTML fixtures, повторяющие реальную структуру публичной страницы
// hh.ru/vacancy (branded layout, JSON-LD JobPosting, data-qa атрибуты,
// meta description). Основано на live-замере структуры (P18 research),
// без live-network зависимости в тестах.

export const FIXTURE_VACANCY_HTML = `<!DOCTYPE html>
<html class="desktop" lang="ru">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title data-rh="">Вакансия Frontend- разработчик (Angular) в Москве, работа в компании БАНК УРАЛСИБ</title>
<meta data-rh="" name="description" content="Вакансия Frontend- разработчик (Angular) в компании БАНК УРАЛСИБ. Зарплата: от 250000 до 350000 ₽. Москва. Требуемый опыт: 3–6 лет. Занятость: полная. Дата публикации: 02.09.2026.">
<script id="js-script-global-vars" nonce="">window.globalVars = {"vacancyId": 135822080};</script>
</head>
<body class="s-friendly xs-friendly">
<div id="HH-React-Root" class="XHH-ReactRoot" data-ssr-status="success">
<div class="vacancy-title">
<h1 data-qa="vacancy-title" class="bloko-header-section-1">Frontend- разработчик (Angular)</h1>
<span class="magritte-text">Уровень дохода не указан</span>
</div>
<a data-qa="vacancy-company-name" href="/employer/89"><span class="magritte-text">ПАО <!-- -->БАНК УРАЛСИБ</span></a>
<p data-qa="work-experience-text" class="magritte-text">Опыт работы<!-- -->: <span data-qa="vacancy-experience">3–6 лет</span></p>
<div data-qa="common-employment-text" class="magritte-text"><div class="dotted-wrapper"><span>Полная занятость</span></div></div>
<p data-qa="work-formats-text" class="magritte-text">Формат работы: <!-- -->удалённо</p>
<div data-qa="vacancy-address-with-map" class="magritte-text">Москва</div>
</div>
<div class="vacancy-description">
<div class="vacancy-section">
<div class="vacancy-branded-description">
<div class="l-paddings b-vacancy-desc"><div class="vacancy-branded-user-content" itemprop="description" data-qa="vacancy-description"><p><strong>Чем предстоит заниматься</strong></p> <ul> <li> <p>разрабатывать пользовательские интерфейсы на Angular</p> </li> <li> <p>участвовать в code review</p> </li> </ul> <p><strong>Наши ожидания</strong></p> <ul> <li> <p>коммерческий опыт разработки на JavaScript от 3 лет</p> </li> <li> <p>опыт работы с Angular 20+, TypeScript, RxJS, HTML и CSS</p> </li> </ul> <p>Мы предлагаем ДМС и белую зарплату.</p></div></div>
</div>
</div>
</div>
<script type="application/ld+json">{
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "description": "<p><strong>Чем предстоит заниматься</strong></p> <ul> <li> <p>разрабатывать пользовательские интерфейсы на Angular</p> </li> <li> <p>участвовать в code review</p> </li> </ul> <p><strong>Наши ожидания</strong></p> <ul> <li> <p>коммерческий опыт разработки на JavaScript от 3 лет</p> </li> <li> <p>опыт работы с Angular 20+, TypeScript, RxJS, HTML и CSS</p> </li> </ul> <p>Мы предлагаем ДМС и белую зарплату.</p>",
    "datePosted": "2026-09-02T09:49:40.596+03:00",
    "title": "Frontend- разработчик (Angular)",
    "hiringOrganization": {
        "@type": "Organization",
        "name": "БАНК УРАЛСИБ"
    },
    "jobLocation": {
        "@type": "Place",
        "address": {
            "@type": "PostalAddress",
            "addressLocality": "Москва",
            "addressRegion": "Москва",
            "addressCountry": "RU"
        }
    },
    "identifier": {
        "@type": "PropertyValue",
        "name": "БАНК УРАЛСИБ",
        "value": 135822080
    }
}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","@id":"https://nn.hh.ru/#website","url":"https://nn.hh.ru/","name":"hh.ru"}]}</script>
<template style="display:none" id="HH-Lux-InitialState">&#34;vacancyView&#34;:{&#34;vacancyId&#34;:135822080}</template>
</body>
</html>`;

/** Fixture без JSON-LD (fallback на data-qa контейнер). */
export const FIXTURE_NO_LD_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta name="description" content="Вакансия Backend Developer в компании ООО Ромашка. Зарплата: не указана. Санкт-Петербург. Требуемый опыт: 1–3 года. Занятость: полная.">
</head>
<body>
<h1 data-qa="vacancy-title">Backend Developer</h1>
<a data-qa="vacancy-company-name" href="/employer/1"><span>ООО Ромашка</span></a>
<div data-qa="vacancy-address-with-map">Санкт-Петербург</div>
<div class="g-user-content" data-qa="vacancy-description"><p><strong>Требования:</strong></p><ul><li>Знание Python и PostgreSQL</li><li>Опыт работы от 1 года</li></ul></div>
</body>
</html>`;

/** Fixture без description вообще — extraction должен отказаться. */
export const FIXTURE_EMPTY_HTML = `<!DOCTYPE html>
<html lang="ru">
<head><title>hh.ru — главная</title></head>
<body><div>Ничего похожего на вакансию здесь нет</div></body>
</html>`;
