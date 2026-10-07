package com.stooorna.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightStatusBars(false);
        View content = findViewById(android.R.id.content);
        content.setBackgroundColor(Color.parseColor("#060E0E"));
        ViewCompat.setOnApplyWindowInsetsListener(content, new TopInsetsListener());
        ViewCompat.requestApplyInsets(content);
    }
}
