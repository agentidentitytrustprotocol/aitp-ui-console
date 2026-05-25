import { render, screen, fireEvent } from '@testing-library/react';
import { RunInputForm } from './run-input-form';
import type { JSONSchema } from '@/lib/types/playground';

describe('RunInputForm', () => {
  it('renders a text input for string properties and submits the entered value', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        topic: { type: 'string' },
      },
      required: ['topic'],
    };
    const onSubmit = jest.fn();
    render(<RunInputForm schema={schema} onSubmit={onSubmit} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'AI agent trust' } });
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));

    expect(onSubmit).toHaveBeenCalledWith({ topic: 'AI agent trust' });
  });

  it('renders a select when property has an enum', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        style: { type: 'string', enum: ['casual', 'academic'], default: 'casual' },
      },
    };
    const onSubmit = jest.fn();
    render(<RunInputForm schema={schema} onSubmit={onSubmit} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'academic' } });
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));

    expect(onSubmit).toHaveBeenCalledWith({ style: 'academic' });
  });

  it('renders a checkbox for boolean properties', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        eager: { type: 'boolean' },
      },
    };
    const onSubmit = jest.fn();
    render(<RunInputForm schema={schema} onSubmit={onSubmit} />);

    const cb = screen.getByRole('checkbox');
    fireEvent.click(cb);
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));

    expect(onSubmit).toHaveBeenCalledWith({ eager: true });
  });

  it('renders a number input for numeric properties', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        n: { type: 'integer', default: 1 },
      },
    };
    const onSubmit = jest.fn();
    render(<RunInputForm schema={schema} onSubmit={onSubmit} />);

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));

    expect(onSubmit).toHaveBeenCalledWith({ n: 5 });
  });

  it('falls back to an inputless form for empty schemas and still submits', () => {
    const onSubmit = jest.fn();
    render(<RunInputForm schema={{ type: 'object', properties: {} }} onSubmit={onSubmit} />);
    expect(screen.getByText(/takes no inputs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it('disables the button and shows "Starting…" while loading', () => {
    render(
      <RunInputForm
        schema={{ type: 'object', properties: { x: { type: 'string' } } }}
        onSubmit={() => undefined}
        loading
      />,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent(/starting/i);
  });
});
