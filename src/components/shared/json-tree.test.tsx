import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JsonTree } from './json-tree';

describe('JsonTree primitive dispatch', () => {
  it('renders strings quoted in the string color', () => {
    render(<JsonTree name="msg" value="hello" />);
    const str = screen.getByText('"hello"');
    expect(str).toHaveStyle({ color: '#22c55e' });
    expect(str).toHaveAttribute('title', 'hello');
    expect(screen.getByText('"msg":')).toHaveStyle({ color: '#8aa9d6' });
  });

  it('renders numbers in the number color', () => {
    render(<JsonTree value={42} />);
    expect(screen.getByText('42')).toHaveStyle({ color: '#3b82f6' });
  });

  it('renders booleans in the boolean color', () => {
    render(<JsonTree value={false} />);
    expect(screen.getByText('false')).toHaveStyle({ color: '#a78bfa' });
  });

  it('renders null in the null color', () => {
    render(<JsonTree value={null} />);
    expect(screen.getByText('null')).toHaveStyle({ color: '#6b7280' });
  });
});

describe('JsonTree containers', () => {
  it('labels objects with their key count and renders children', () => {
    render(<JsonTree value={{ a: 1, b: 'two' }} />);
    expect(screen.getByText('{2}')).toBeInTheDocument();
    expect(screen.getByText('"a":')).toBeInTheDocument();
    expect(screen.getByText('"two"')).toBeInTheDocument();
  });

  it('labels arrays with their length and indexes children', () => {
    render(<JsonTree name="items" value={['x', 'y', 'z']} />);
    expect(screen.getByText('[3]')).toBeInTheDocument();
    expect(screen.getByText('"items":')).toBeInTheDocument();
    expect(screen.getByText('"z"')).toBeInTheDocument();
  });

  it('collapses an expanded node on click', async () => {
    const user = userEvent.setup();
    render(<JsonTree value={{ a: 1 }} />);
    expect(screen.getByText('"a":')).toBeInTheDocument();

    await user.click(screen.getByText('{1}'));
    expect(screen.queryByText('"a":')).not.toBeInTheDocument();

    await user.click(screen.getByText('{1}'));
    expect(screen.getByText('"a":')).toBeInTheDocument();
  });
});

describe('JsonTree default-open depth', () => {
  const deep = { a: { b: { c: { d: 1 } } } };

  it('opens the first two levels and collapses deeper nodes', () => {
    render(<JsonTree value={deep} />);
    // root and "a" are visible/open; "b" is rendered but collapsed.
    expect(screen.getByText('"a":')).toBeInTheDocument();
    expect(screen.getByText('"b":')).toBeInTheDocument();
    expect(screen.queryByText('"c":')).not.toBeInTheDocument();
  });

  it('expands a collapsed deep node on click, one level at a time', async () => {
    const user = userEvent.setup();
    render(<JsonTree value={deep} />);

    await user.click(screen.getByText('"b":'));
    expect(screen.getByText('"c":')).toBeInTheDocument();
    // The next level down starts collapsed too.
    expect(screen.queryByText('"d":')).not.toBeInTheDocument();

    await user.click(screen.getByText('"c":'));
    expect(screen.getByText('"d":')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

describe('JsonTree highlight callback', () => {
  it('receives the object path for each string leaf and can recolor it', () => {
    const highlight = jest.fn((path: string[]) =>
      path.join('.') === 'user.name' ? '#ff0000' : null,
    );
    render(<JsonTree value={{ user: { name: 'alice', role: 'admin' } }} highlight={highlight} />);

    expect(highlight).toHaveBeenCalledWith(['user', 'name'], 'alice');
    expect(highlight).toHaveBeenCalledWith(['user', 'role'], 'admin');
    expect(screen.getByText('"alice"')).toHaveStyle({ color: '#ff0000' });
    // Non-matching strings keep the default string color.
    expect(screen.getByText('"admin"')).toHaveStyle({ color: '#22c55e' });
  });

  it('uses array indices in the path', () => {
    const highlight = jest.fn(() => null);
    render(<JsonTree value={{ tags: ['x', 'y'] }} highlight={highlight} />);
    expect(highlight).toHaveBeenCalledWith(['tags', '0'], 'x');
    expect(highlight).toHaveBeenCalledWith(['tags', '1'], 'y');
  });
});
