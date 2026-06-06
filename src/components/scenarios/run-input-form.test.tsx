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

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: { topic: 'AI agent trust' } }),
    );
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

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: { style: 'academic' } }),
    );
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

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ inputs: { eager: true } }));
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

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ inputs: { n: 5 } }));
  });

  it('falls back to an inputless form for empty schemas and still submits', () => {
    const onSubmit = jest.fn();
    render(<RunInputForm schema={{ type: 'object', properties: {} }} onSubmit={onSubmit} />);
    expect(screen.getByText(/takes no inputs/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ inputs: {} }));
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

  it('passes selected template + variant on submit', () => {
    const schema: JSONSchema = { type: 'object', properties: {} };
    const onSubmit = jest.fn();
    render(
      <RunInputForm
        schema={schema}
        templates={[
          {
            id: 'template-a',
            name: 'Template A',
            variants: [{ id: 'variant-1', name: 'V1' }],
          },
        ]}
        onSubmit={onSubmit}
      />,
    );
    // Variant select only appears after the template is chosen.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'template-a' } });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'variant-1' } });
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'template-a', variant: 'variant-1' }),
    );
  });

  it('emits fault_injection when an advanced fault is toggled', () => {
    const schema: JSONSchema = { type: 'object', properties: {} };
    const onSubmit = jest.fn();
    render(
      <RunInputForm
        schema={schema}
        agents={[{ id: 'planner', ref: 'pack/p@1', port_offset: 0 }]}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }));
    // First "planner" button is in the manifest_404 group; second is peer_offline.
    const [manifest404PlannerBtn] = screen.getAllByRole('button', { name: 'planner' });
    fireEvent.click(manifest404PlannerBtn);
    fireEvent.click(screen.getByRole('button', { name: /run scenario/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ fault_injection: { manifest_404: ['planner'] } }),
    );
  });
});
