import { useUIAppearance } from '@stratino/ui';
import { useState } from 'react';
import { Link } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
const steps = [
  {
    title: 'شناخت و تحلیل',
    text: 'مشتری، شواهد و عوامل مؤثر بر پروژه را کنار هم ببینید.',
    detail: 'ICP و تحلیل محیط',
    href: 'company',
  },
  {
    title: 'انتخاب و تصمیم',
    text: 'گزینه‌ها را با فرض‌ها و محدودیت‌هایشان مقایسه کنید.',
    detail: 'SWOT و ماتریس‌های تصمیم',
    href: 'swot',
  },
  {
    title: 'برنامه اجرا',
    text: 'برای تصمیم‌ها، اقدام بعدی، مسئول و موعد روشن کنید.',
    detail: 'برنامه اقدام و بازبینی',
    href: 'execution',
  },
  {
    title: 'مدارک ارائه',
    text: 'بدانید چه مدرکی لازم است و چطور باید نوشته شود.',
    detail: 'راهنمای مدارک مدیریتی',
    href: 'documents',
  },
];
export default function Site() {
  const [active, setActive] = useState(0);
  const systemReduced = useReducedMotion();
  const { motion: motionPreference } = useUIAppearance();
  const reduced = systemReduced || motionPreference === 'reduced';
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="context-label">فضای مدیریت استراتژی</p>
          <h1 tabIndex={-1}>
            تحلیل‌هایتان را
            <br />
            به اقدام برسانید.
          </h1>
          <p className="lead">
            برای هر پروژه، یک مسیر روشن از شناخت کسب‌وکار تا تصمیم، برنامه اجرا و مدارک قابل ارائه.
            همراه با آموزش، درست وقتی به آن نیاز دارید.
          </p>
          <div className="hero-actions">
            <Link className="ui-button ui-button--primary" to="/management-preview">
              دیدن پنل مدیریت
            </Link>
            <Link className="text-link" to="/demo">
              نسخه تعاملی ابزارهای قبلی
            </Link>
          </div>
          <p className="availability">
            پیش‌نمایش مدیریت با دادهٔ نمونه آماده است؛ فضای واقعی با ورود به حساب باز می‌شود.
          </p>
        </div>
        <div className="strategy-scene" aria-label="نمایش مسیر تحلیل تا اقدام">
          <div className="scene-head">
            <span className="scene-dot" />
            <strong>مسیر پروژه شما</strong>
            <span>یک تصمیم، یک قدم بعدی</span>
          </div>
          <ol className="strategy-path">
            {steps.map((step, index) => (
              <li key={step.title}>
                <button aria-pressed={active === index} onClick={() => setActive(index)}>
                  <span className="path-node">
                    {new Intl.NumberFormat('fa-IR').format(index + 1)}
                  </span>
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                  </span>
                  <span className="path-check" aria-hidden="true">
                    {index < active ? '✓' : index === active ? '←' : '·'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <motion.div
            className="scene-detail"
            key={active}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <span>قدم انتخاب‌شده</span>
            <h2>{steps[active].title}</h2>
            <p>{steps[active].text}</p>
            <a href={'/prototype/#' + steps[active].href}>بازکردن این بخش در نمونه</a>
          </motion.div>
        </div>
      </section>
      <section id="workflow" className="workflow">
        <div className="section-heading">
          <h2>یک مسیر پیوسته برای کار مدیر</h2>
          <p>ابزارها کنار نتیجه‌ای قرار می‌گیرند که می‌خواهید بسازید.</p>
        </div>
        <div className="workflow-grid">
          {steps.map((step, index) => (
            <article key={step.title}>
              <span className="step-number">
                {new Intl.NumberFormat('fa-IR').format(index + 1)}
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <a href={'/prototype/#' + step.href}>بررسی در نسخه نمونه</a>
            </article>
          ))}
        </div>
      </section>
      <section className="workspace-intro">
        <div>
          <h2>هر پروژه، فضای خودش را دارد.</h2>
          <p>
            پروژه‌های مستقل به اطلاعات، تحلیل و برنامه مستقل نیاز دارند. پایه جدید استراتینو برای
            همین جداسازی ساخته می‌شود.
          </p>
        </div>
        <div className="project-stack" aria-label="نمونه مفهومی پروژه‌های مستقل">
          <div>
            <span>پروژه اول</span>
            <strong>تحلیل و برنامه رشد</strong>
          </div>
          <div>
            <span>پروژه دوم</span>
            <strong>آماده‌سازی مدارک ارائه</strong>
          </div>
          <p>فضای سروری چندپروژه‌ای در حال توسعه است.</p>
        </div>
      </section>
    </>
  );
}
