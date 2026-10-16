import { Icon } from './ExperienceUI';
export function ChoiceGroup({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: { id: string; label: string; text?: string; icon?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="ex-choices">
      <legend className="ex-sr-only">{label}</legend>
      {choices.map((choice) => (
        <label className={`ex-choice${value === choice.id ? ' is-selected' : ''}`} key={choice.id}>
          <input
            type="radio"
            name={label}
            value={choice.id}
            checked={value === choice.id}
            onChange={() => onChange(choice.id)}
          />
          {choice.icon && (
            <span className="ex-choice-icon">
              <Icon name={choice.icon} size={24} />
            </span>
          )}
          <span>
            <strong>{choice.label}</strong>
            {choice.text && <small>{choice.text}</small>}
          </span>
          <span className="ex-radio-mark">
            {value === choice.id && <Icon name="check" size={14} />}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="ex-colors">
      <legend>رنگ فضای کار</legend>
      {Object.entries({ blue: 'آبی', purple: 'بنفش', green: 'سبز', orange: 'نارنجی' }).map(
        ([color, label]) => (
          <label key={color} className={`ex-color--${color}`} title={label}>
            <input
              type="radio"
              name="space-color"
              checked={value === color}
              onChange={() => onChange(color)}
              aria-label={label}
            />
            <span>{value === color && <Icon name="check" size={18} />}</span>
          </label>
        ),
      )}
    </fieldset>
  );
}
