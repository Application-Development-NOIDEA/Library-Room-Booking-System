<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f4f2f1;font-family:Arial,Helvetica,sans-serif;color:#2b2430;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:#75243a;padding:22px 28px;color:#ffffff;">
              <div style="font-size:20px;font-weight:bold;letter-spacing:2px;">PSZ</div>
              <div style="font-size:13px;opacity:0.85;">Perpustakaan Sultanah Zanariah</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 14px;font-size:15px;">Hi {{ $name }},</p>
              <h2 style="margin:0 0 10px;font-size:18px;color:{{ $urgent ? '#8a1f17' : '#75243a' }};">{{ $title }}</h2>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;">{{ $text }}</p>
              @if ($buttonLabel)
                <p style="margin:0 0 22px;">
                  <a href="{{ $link }}" style="display:inline-block;padding:13px 26px;background:#75243a;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:bold;font-size:15px;">
                    {{ $buttonLabel }}
                  </a>
                </p>
              @endif
              <p style="margin:0;font-size:12px;color:#9a929d;line-height:1.6;">
                You get this email because you use PSZ Room Booking. You can also see it under the bell icon after you sign in.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>