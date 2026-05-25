/** All lucide-react icons become a tiny <svg data-icon="Name"> stub.
 *  Lets tests run without dealing with lucide's ESM-only icon files. */
import type { ComponentType } from 'react';

type IconProps = {
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
};

function makeIcon(name: string): ComponentType<IconProps> {
  function Icon(props: IconProps) {
    const { size = 16, color, className, style, onClick } = props;
    return (
      <svg
        data-icon={name}
        width={size}
        height={size}
        fill={color}
        className={className}
        style={style}
        onClick={onClick}
        aria-hidden="true"
      />
    );
  }
  Icon.displayName = name;
  return Icon;
}

const handler: ProxyHandler<Record<string, ComponentType<IconProps>>> = {
  get(target, prop) {
    if (typeof prop !== 'string') return undefined;
    if (!target[prop]) target[prop] = makeIcon(prop);
    return target[prop];
  },
};

const proxy = new Proxy({}, handler) as Record<string, ComponentType<IconProps>>;

// Re-export the proxy by name. Jest moduleNameMapper resolves bare imports to
// this file, and ESM-style `import { Foo } from 'lucide-react'` then reads
// `Foo` off `module.exports`, which is this proxy.
module.exports = proxy;
