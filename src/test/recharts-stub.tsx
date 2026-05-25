import type { ReactNode } from 'react';

const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
const NullEl = () => <div />;

export const ResponsiveContainer = Passthrough;
export const AreaChart = Passthrough;
export const Area = NullEl;
export const BarChart = Passthrough;
export const Bar = NullEl;
export const PieChart = Passthrough;
export const Pie = NullEl;
export const Cell = NullEl;
export const XAxis = NullEl;
export const YAxis = NullEl;
export const CartesianGrid = NullEl;
export const Tooltip = NullEl;
export const Legend = NullEl;
