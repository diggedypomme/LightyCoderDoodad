package com.lightycoder.doodad;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.util.Arrays;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int W = 12;
    private static final int H = 12;
    private static final int CELL_COUNT = W * H;
    private static final int BG = Color.rgb(245, 247, 250);
    private static final int PANEL = Color.WHITE;
    private static final int TEXT = Color.rgb(24, 30, 38);
    private static final int MUTED = Color.rgb(91, 101, 113);
    private static final int BLUE = Color.rgb(47, 125, 225);

    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic commandChar;
    private TextView status;
    private LinearLayout content;
    private GridLayout padGrid;
    private ImageView imagePreview;
    private final int[] pixels = new int[CELL_COUNT];
    private final boolean[] selected = new boolean[CELL_COUNT];
    private final Button[] cells = new Button[CELL_COUNT];
    private int selectedColor = Color.RED;
    private int brightness = 180;
    private boolean multiSelect = true;
    private boolean paintStarted = false;
    private int animationMode = 0;
    private int animationStep = 0;
    private boolean animationRunning = false;

    private final Runnable animationTick = new Runnable() {
        @Override public void run() {
            if (!animationRunning) return;
            renderAnimationFrame(animationMode, animationStep++);
            sendPixels(false);
            main.postDelayed(this, 260);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Arrays.fill(pixels, Color.BLACK);
        BluetoothManager manager = getSystemService(BluetoothManager.class);
        adapter = manager == null ? null : manager.getAdapter();
        scanner = adapter == null ? null : adapter.getBluetoothLeScanner();
        requestBlePermissions();
        buildShell();
        showPadPage();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void buildShell() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(14), dp(14), dp(14), dp(14));
        root.setBackgroundColor(BG);

        TextView title = new TextView(this);
        title.setText("LightyCoderDoodad");
        title.setTextColor(TEXT);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setTypeface(null, 1);
        root.addView(title);

        status = new TextView(this);
        status.setText("Disconnected");
        status.setTextColor(MUTED);
        status.setTextSize(14);
        root.addView(status);

        LinearLayout top = row();
        addButton(top, "Connect", v -> scanAndConnect(), 1, BLUE);
        addButton(top, "Start Paint", v -> startPaint(), 1, Color.rgb(42, 157, 93));
        addButton(top, "Disconnect", v -> disconnect(), 1, Color.rgb(210, 74, 74));
        root.addView(top);

        LinearLayout nav = row();
        addButton(nav, "Pad", v -> showPadPage(), 1, Color.rgb(230, 235, 241));
        addButton(nav, "Images", v -> showImagesPage(), 1, Color.rgb(230, 235, 241));
        addButton(nav, "Animations", v -> showAnimationsPage(), 1, Color.rgb(230, 235, 241));
        root.addView(nav);

        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
    }

    private LinearLayout row() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, dp(8));
        return row;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(PANEL);
        bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), Color.rgb(218, 225, 232));
        card.setBackground(bg);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(12), 0, dp(12));
        card.setLayoutParams(params);
        return card;
    }

    private Button addButton(LinearLayout parent, String label, View.OnClickListener listener, int weight, int color) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(readableText(color));
        button.setTextSize(13);
        button.setOnClickListener(listener);
        button.setBackground(rounded(color, dp(1), darker(color), dp(9)));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(46), weight);
        params.setMargins(dp(3), 0, dp(3), 0);
        parent.addView(button, params);
        return button;
    }

    private GradientDrawable rounded(int fill, int strokeWidth, int stroke, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        drawable.setStroke(strokeWidth, stroke);
        return drawable;
    }

    private int darker(int color) {
        return Color.rgb(Color.red(color) * 82 / 100, Color.green(color) * 82 / 100, Color.blue(color) * 82 / 100);
    }

    private int readableText(int color) {
        return Color.red(color) + Color.green(color) + Color.blue(color) < 430 ? Color.WHITE : TEXT;
    }

    private void showPadPage() {
        animationRunning = false;
        content.removeAllViews();
        LinearLayout controls = card();
        controls.addView(label("Paint Pad"));
        controls.addView(text("Tap a square to paint it with the current colour. Selected cells have a blue outline."));
        addColorControls(controls);
        CheckBox multi = new CheckBox(this);
        multi.setText("Keep multiple cells selected");
        multi.setTextColor(TEXT);
        multi.setChecked(multiSelect);
        multi.setOnCheckedChangeListener((buttonView, isChecked) -> multiSelect = isChecked);
        controls.addView(multi);
        content.addView(controls);

        LinearLayout gridCard = card();
        padGrid = new GridLayout(this);
        padGrid.setColumnCount(W);
        padGrid.setUseDefaultMargins(false);
        for (int i = 0; i < CELL_COUNT; i++) {
            final int index = i;
            Button cell = new Button(this);
            cell.setText("");
            cell.setPadding(0, 0, 0, 0);
            cell.setMinWidth(0);
            cell.setMinimumWidth(0);
            cell.setMinHeight(0);
            cell.setMinimumHeight(0);
            cell.setOnClickListener(v -> paintCell(index));
            cell.setOnLongClickListener(v -> { pixels[index] = Color.BLACK; selected[index] = false; renderGrid(); return true; });
            cells[i] = cell;
            padGrid.addView(cell);
        }
        gridCard.addView(padGrid, new LinearLayout.LayoutParams(-1, -2));
        content.addView(gridCard);

        LinearLayout actions = card();
        LinearLayout row = row();
        addButton(row, "Send", v -> sendPixels(true), 1, BLUE);
        addButton(row, "Clear Selected", v -> clearSelection(), 1, Color.rgb(230, 235, 241));
        addButton(row, "Clear All", v -> clearAllPixels(), 1, Color.rgb(230, 235, 241));
        actions.addView(row);
        content.addView(actions);
        resizePadCells();
        renderGrid();
    }

    private void showImagesPage() {
        animationRunning = false;
        content.removeAllViews();
        LinearLayout panel = card();
        panel.addView(label("Images"));
        panel.addView(text("Choose an image from your phone. It is centre-cropped, downsampled to 12x12, and sent through paint mode."));
        LinearLayout row = row();
        addButton(row, "Choose Image", v -> pickImage(), 1, BLUE);
        addButton(row, "Send Image", v -> sendPixels(true), 1, Color.rgb(42, 157, 93));
        panel.addView(row);
        imagePreview = new ImageView(this);
        imagePreview.setImageBitmap(bitmapFromPixels());
        imagePreview.setBackgroundColor(Color.rgb(230, 235, 241));
        imagePreview.setAdjustViewBounds(true);
        imagePreview.setPadding(dp(8), dp(8), dp(8), dp(8));
        panel.addView(imagePreview, new LinearLayout.LayoutParams(-1, dp(380)));
        content.addView(panel);
    }

    private void showAnimationsPage() {
        content.removeAllViews();
        LinearLayout panel = card();
        panel.addView(label("Animations"));
        panel.addView(text("Generated on the phone and streamed as compact canvas frames."));
        addColorControls(panel);
        LinearLayout row1 = row();
        addButton(row1, "Wipe", v -> startAnimation(0), 1, BLUE);
        addButton(row1, "Pulse", v -> startAnimation(1), 1, BLUE);
        addButton(row1, "Rainbow", v -> startAnimation(2), 1, BLUE);
        panel.addView(row1);
        LinearLayout row2 = row();
        addButton(row2, "Heart", v -> startAnimation(3), 1, Color.rgb(226, 66, 112));
        addButton(row2, "Sparkle", v -> startAnimation(4), 1, BLUE);
        addButton(row2, "Scanner", v -> startAnimation(5), 1, BLUE);
        panel.addView(row2);
        addButton(panel, "Stop Animation", v -> animationRunning = false, 1, Color.rgb(230, 235, 241));
        content.addView(panel);
    }

    private void addColorControls(LinearLayout parent) {
        TextView brush = text("Brush colour");
        brush.setTextColor(MUTED);
        parent.addView(brush);
        LinearLayout colours = row();
        addColourButton(colours, "Red", Color.RED);
        addColourButton(colours, "Green", Color.GREEN);
        addColourButton(colours, "Blue", Color.BLUE);
        addColourButton(colours, "White", Color.WHITE);
        addColourButton(colours, "Yellow", Color.YELLOW);
        parent.addView(colours);
        TextView brightLabel = text("Brightness: " + brightness);
        parent.addView(brightLabel);
        SeekBar slider = new SeekBar(this);
        slider.setMax(255);
        slider.setProgress(brightness);
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                brightness = Math.max(1, progress);
                brightLabel.setText("Brightness: " + brightness);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        parent.addView(slider);
    }

    private void addColourButton(LinearLayout parent, String label, int color) {
        addButton(parent, label, v -> selectedColor = color, 1, color);
    }

    private TextView label(String text) {
        TextView view = text(text);
        view.setTextColor(TEXT);
        view.setTextSize(22);
        view.setTypeface(null, 1);
        view.setPadding(0, 0, 0, dp(8));
        return view;
    }

    private TextView text(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(MUTED);
        view.setTextSize(14);
        view.setPadding(0, dp(4), 0, dp(6));
        return view;
    }

    private void resizePadCells() {
        if (padGrid == null) return;
        padGrid.post(() -> {
            int total = padGrid.getWidth();
            if (total <= 0) return;
            int gap = dp(3);
            int size = (total - gap * (W - 1)) / W;
            for (int i = 0; i < CELL_COUNT; i++) {
                GridLayout.LayoutParams params = new GridLayout.LayoutParams(GridLayout.spec(i / W), GridLayout.spec(i % W));
                params.width = size;
                params.height = size;
                params.setMargins(i % W == 0 ? 0 : gap, i < W ? 0 : gap, 0, 0);
                cells[i].setLayoutParams(params);
            }
        });
    }

    private void paintCell(int index) {
        if (!multiSelect) Arrays.fill(selected, false);
        selected[index] = !selected[index];
        pixels[index] = scaledColor(selectedColor);
        renderGrid();
    }

    private int scaledColor(int color) {
        return Color.rgb(Color.red(color) * brightness / 255, Color.green(color) * brightness / 255, Color.blue(color) * brightness / 255);
    }

    private void clearSelection() {
        Arrays.fill(selected, false);
        renderGrid();
    }

    private void clearAllPixels() {
        Arrays.fill(pixels, Color.BLACK);
        Arrays.fill(selected, false);
        renderGrid();
    }

    private void renderGrid() {
        for (int i = 0; i < cells.length; i++) {
            if (cells[i] == null) continue;
            int fill = pixels[i];
            int stroke = selected[i] ? BLUE : Color.rgb(188, 197, 207);
            int strokeWidth = selected[i] ? dp(3) : dp(1);
            cells[i].setBackground(rounded(fill, strokeWidth, stroke, dp(5)));
        }
    }

    private void requestBlePermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}, 10);
        } else {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 10);
        }
    }

    private boolean hasBlePermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            return checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
                    && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void scanAndConnect() {
        if (!hasBlePermission()) { requestBlePermissions(); return; }
        if (adapter == null || !adapter.isEnabled()) {
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) { toast("No BLE scanner"); return; }
        status.setText("Scanning...");
        scanner.startScan(scanCallback);
        main.postDelayed(() -> {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) {}
            if (gatt == null) status.setText("No Arcade Coder found");
        }, 8000);
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String name = device.getName() == null ? "" : device.getName();
            boolean likely = name.toLowerCase(Locale.ROOT).contains("arcade") || name.toLowerCase(Locale.ROOT).contains("coder");
            if (!likely && result.getScanRecord() != null && result.getScanRecord().getServiceUuids() != null) {
                likely = result.getScanRecord().getServiceUuids().toString().toLowerCase(Locale.ROOT).contains(Protocol.SERVICE_UUID.toString());
            }
            if (!likely) return;
            try { scanner.stopScan(this); } catch (Exception ignored) {}
            status.setText("Connecting " + (name.isEmpty() ? device.getAddress() : name));
            gatt = device.connectGatt(MainActivity.this, false, gattCallback);
        }
    };

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int statusCode, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                g.requestMtu(517);
                g.discoverServices();
                main.post(() -> status.setText("Connected"));
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                commandChar = null;
                paintStarted = false;
                main.post(() -> status.setText("Disconnected"));
            }
        }
        @Override public void onServicesDiscovered(BluetoothGatt g, int statusCode) {
            BluetoothGattService service = g.getService(Protocol.SERVICE_UUID);
            commandChar = service == null ? null : service.getCharacteristic(Protocol.COMMAND_CHAR);
            main.post(() -> status.setText(commandChar == null ? "Connected, service not found" : "Connected, ready"));
        }
    };

    private void disconnect() {
        animationRunning = false;
        if (gatt != null) {
            gatt.disconnect();
            gatt.close();
        }
        gatt = null;
        commandChar = null;
        paintStarted = false;
        status.setText("Disconnected");
    }

    private void startPaint() {
        write(Protocol.startBuiltin("paint"));
        paintStarted = true;
        status.setText("Paint start sent");
    }

    private void sendPixels(boolean startIfNeeded) {
        if (startIfNeeded && !paintStarted) {
            startPaint();
            main.postDelayed(() -> sendPixels(false), 1300);
            return;
        }
        byte[] canvas = Protocol.compactCanvasFromDisplayRgb(pixels);
        write(Protocol.compactCanvasCommand(canvas));
        status.setText("Sent " + canvas.length + " byte canvas");
    }

    private void write(byte[] data) {
        if (gatt == null || commandChar == null) { toast("Not connected"); return; }
        commandChar.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
        commandChar.setValue(data);
        boolean ok = gatt.writeCharacteristic(commandChar);
        if (!ok) toast("BLE write failed to queue");
    }

    private void pickImage() {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("image/*");
        startActivityForResult(Intent.createChooser(intent, "Choose image"), 20);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != 20 || resultCode != RESULT_OK || data == null) return;
        try {
            Uri uri = data.getData();
            InputStream stream = getContentResolver().openInputStream(uri);
            Bitmap bitmap = BitmapFactory.decodeStream(stream);
            if (bitmap != null) loadBitmapToPixels(bitmap);
            showImagesPage();
        } catch (Exception e) {
            toast(e.getMessage());
        }
    }

    private void loadBitmapToPixels(Bitmap bitmap) {
        int size = Math.min(bitmap.getWidth(), bitmap.getHeight());
        int left = (bitmap.getWidth() - size) / 2;
        int top = (bitmap.getHeight() - size) / 2;
        Bitmap crop = Bitmap.createBitmap(bitmap, left, top, size, size);
        Bitmap small = Bitmap.createScaledBitmap(crop, W, H, true);
        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                int c = small.getPixel(x, y);
                pixels[y * W + x] = Color.rgb(Color.red(c), Color.green(c), Color.blue(c));
            }
        }
        Arrays.fill(selected, false);
    }

    private Bitmap bitmapFromPixels() {
        Bitmap bitmap = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) bitmap.setPixel(x, y, pixels[y * W + x]);
        return Bitmap.createScaledBitmap(bitmap, dp(360), dp(360), false);
    }

    private void startAnimation(int mode) {
        animationRunning = false;
        animationMode = mode;
        animationStep = 0;
        animationRunning = true;
        animationTick.run();
    }

    private void renderAnimationFrame(int mode, int t) {
        Arrays.fill(pixels, Color.BLACK);
        if (mode == 0) {
            for (int i = 0; i <= t % CELL_COUNT; i++) pixels[i] = scaledColor(selectedColor);
        } else if (mode == 1) {
            int v = 30 + (int)(Math.abs(Math.sin(t * 0.25)) * 225);
            for (int i = 0; i < CELL_COUNT; i++) pixels[i] = Color.rgb(v, 0, 255 - v);
        } else if (mode == 2) {
            for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
                float hue = ((x * 30 + y * 10 + t * 8) % 360);
                pixels[y * W + x] = Color.HSVToColor(new float[]{hue, 1.0f, brightness / 255f});
            }
        } else if (mode == 3) {
            renderHeart(t);
        } else if (mode == 4) {
            for (int i = 0; i < 18; i++) {
                int index = Math.abs((t * 17 + i * 41) % CELL_COUNT);
                pixels[index] = Color.WHITE;
            }
        } else if (mode == 5) {
            int x = t % (W * 2 - 2);
            if (x >= W) x = W * 2 - 2 - x;
            for (int y = 0; y < H; y++) pixels[y * W + x] = scaledColor(selectedColor);
        }
    }

    private void renderHeart(int t) {
        int pulse = 105 + (int)(Math.abs(Math.sin(t * 0.35)) * 150);
        int color = Color.rgb(pulse, 0, Math.max(25, pulse / 5));
        int[][] coords = {
                {3,2},{4,2},{7,2},{8,2},
                {2,3},{3,3},{4,3},{5,3},{6,3},{7,3},{8,3},{9,3},
                {2,4},{3,4},{4,4},{5,4},{6,4},{7,4},{8,4},{9,4},
                {3,5},{4,5},{5,5},{6,5},{7,5},{8,5},
                {4,6},{5,6},{6,6},{7,6},
                {5,7},{6,7},
                {5,8},{6,8}
        };
        for (int[] xy : coords) pixels[xy[1] * W + xy[0]] = color;
    }

    private void toast(String message) {
        Toast.makeText(this, message == null ? "Error" : message, Toast.LENGTH_SHORT).show();
    }
}