import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../l10n/l10n.dart';
import '../l10n/locale_notifier.dart';
import '../theme/common_widgets.dart';
import 'auth_notifier.dart';
import 'phone.dart';

/// Phone + OTP sign in. Pops with `true` once signed in.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phoneKey = GlobalKey<FormState>();
  final _codeKey = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _code = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _sendCode(AuthNotifier auth) async {
    if (!_phoneKey.currentState!.validate()) return;
    await auth.requestCode(_phone.text);
  }

  Future<void> _verify(AuthNotifier auth) async {
    if (!_codeKey.currentState!.validate()) return;
    final ok = await auth.verify(_code.text);
    if (ok && mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final auth = context.watch<AuthNotifier>();
    final locale = context.read<LocaleNotifier>();
    return Scaffold(
      appBar: AppBar(
        title: Text(l.loginTitle),
        actions: [
          TextButton(
            onPressed: locale.toggle,
            child: Text(
              l.switchLanguageLabel,
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: ContentWidth(
        maxWidth: 480,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(l.loginIntro),
            const SizedBox(height: 20),
            if (auth.step == LoginStep.phone) ..._phoneStep(l, auth),
            if (auth.step == LoginStep.code) ..._codeStep(l, auth),
            if (auth.error != null && !auth.invalidCode) ...[
              const SizedBox(height: 12),
              _ErrorText(apiErrorMessage(l, auth.error!)),
            ],
            if (auth.invalidCode) ...[
              const SizedBox(height: 12),
              _ErrorText(l.loginCodeWrong),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _phoneStep(AppLocalizations l, AuthNotifier auth) => [
    Form(
      key: _phoneKey,
      child: TextFormField(
        controller: _phone,
        keyboardType: TextInputType.phone,
        textDirection: TextDirection.ltr,
        autofillHints: const [AutofillHints.telephoneNumber],
        decoration: InputDecoration(
          labelText: l.loginPhoneLabel,
          helperText: l.loginPhoneHelper,
          prefixIcon: const Icon(Icons.phone_outlined),
        ),
        validator: (v) =>
            normalizeEgyptPhone(v ?? '') == null ? l.loginErrPhone : null,
        onFieldSubmitted: (_) => _sendCode(auth),
      ),
    ),
    const SizedBox(height: 16),
    FilledButton(
      onPressed: auth.busy ? null : () => _sendCode(auth),
      child: auth.busy ? const _Spinner() : Text(l.loginSendCode),
    ),
  ];

  List<Widget> _codeStep(AppLocalizations l, AuthNotifier auth) => [
    Text(l.loginCodeSent(auth.pendingPhone ?? '')),
    const SizedBox(height: 12),
    Form(
      key: _codeKey,
      child: TextFormField(
        controller: _code,
        keyboardType: TextInputType.number,
        textDirection: TextDirection.ltr,
        maxLength: 6,
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[0-9\u0660-\u0669]')),
        ],
        decoration: InputDecoration(
          labelText: l.loginCodeLabel,
          prefixIcon: const Icon(Icons.lock_outline),
        ),
        validator: (v) =>
            normalizeOtpCode(v ?? '') == null ? l.loginErrCode : null,
        onFieldSubmitted: (_) => _verify(auth),
      ),
    ),
    const SizedBox(height: 8),
    FilledButton(
      onPressed: auth.busy ? null : () => _verify(auth),
      child: auth.busy ? const _Spinner() : Text(l.loginVerify),
    ),
    const SizedBox(height: 8),
    OutlinedButton(
      onPressed: auth.busy
          ? null
          : () {
              final p = auth.pendingPhone;
              if (p != null) auth.requestCode(p);
            },
      child: Text(l.loginResendCode),
    ),
    TextButton(
      onPressed: auth.busy ? null : auth.changeNumber,
      child: Text(l.loginChangeNumber),
    ),
  ];
}

class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) => const SizedBox(
    width: 20,
    height: 20,
    child: CircularProgressIndicator(strokeWidth: 2),
  );
}

class _ErrorText extends StatelessWidget {
  const _ErrorText(this.message);
  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Text(
      message,
      style: TextStyle(color: Theme.of(context).colorScheme.error),
    ),
  );
}
