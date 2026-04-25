import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import AppErrorBoundary from '../components/AppErrorBoundary';

function BrokenChild(): React.JSX.Element {
    throw new Error('boom');
}

describe('AppErrorBoundary', () => {
    it('renders the recovery UI and allows reset', () => {
        const onReset = jest.fn();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        render(
            <AppErrorBoundary onReset={onReset}>
                <BrokenChild />
            </AppErrorBoundary>,
        );

        expect(screen.getByText('TuneUp hit an unexpected problem')).toBeTruthy();
        fireEvent.press(screen.getByText('Restart TuneUp'));
        expect(onReset).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });
});
