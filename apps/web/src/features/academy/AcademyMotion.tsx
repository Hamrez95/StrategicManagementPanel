import type { CSSProperties } from 'react';

/** A finite, decorative reaction; never delays navigation or changes the grade. */
export function CelebrationBurst({ small = false }: { small?: boolean }) {
  return (
    <div className={`academy-burst${small ? ' academy-burst--small' : ''}`} aria-hidden="true">
      {Array.from({ length: small ? 12 : 28 }, (_, i) => (
        <i
          key={i}
          style={
            {
              '--particle-x': `${((i * 71) % 360) - 180}px`,
              '--particle-y': `${-80 - ((i * 37) % 160)}px`,
              '--particle-turn': `${i * 53}deg`,
              '--particle-delay': `${(i % 5) * 35}ms`,
              '--particle-color': ['#9bd724', '#70cff9', '#ffc840', '#ee86c7', '#ae94ff'][i % 5],
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
