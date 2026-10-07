package com.stooorna.app;

import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.OnApplyWindowInsetsListener;
import androidx.core.view.WindowInsetsCompat;

/**
 * Keeps the web app between the status bar and the phone's system buttons:
 * top padding = status bar / camera cutout, bottom padding = navigation bar (back / home / recents).
 * While the keyboard is open the bottom padding is dropped so the keyboard resizing works as before.
 */
public class TopInsetsListener implements OnApplyWindowInsetsListener {
    @Override
    public WindowInsetsCompat onApplyWindowInsets(View v, WindowInsetsCompat insets) {
        int types = WindowInsetsCompat.Type.statusBars()
                | WindowInsetsCompat.Type.displayCutout()
                | WindowInsetsCompat.Type.navigationBars();
        Insets bars = insets.getInsets(types);
        Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
        int bottom = ime.bottom > 0 ? 0 : bars.bottom;
        v.setPadding(0, bars.top, 0, bottom);
        return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.NONE)
                .build();
    }
}
