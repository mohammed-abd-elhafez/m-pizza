import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models/menu_models.dart';
import '../cart/cart_notifier.dart';
import '../checkout/location_screen.dart';
import '../l10n/l10n.dart';
import '../theme/app_theme.dart';
import '../theme/common_widgets.dart';
import '../theme/product_assets.dart';
import 'customizer_screen.dart';
import 'menu_notifier.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  int _selected = 0;
  late final ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final notifier = context.watch<MenuNotifier>();
    switch (notifier.status) {
      case LoadStatus.idle:
      case LoadStatus.loading:
        return const Center(child: CircularProgressIndicator());
      case LoadStatus.error:
        return ErrorView(
          message: l.menuLoadFailed,
          retryLabel: l.actionRetry,
          onRetry: notifier.load,
        );
      case LoadStatus.ready:
        final menu = notifier.menu!;
        if (menu.isEmpty) {
          return EmptyView(
            icon: Icons.local_pizza_outlined,
            title: l.menuEmpty,
          );
        }
        final cats = menu.categories;
        final index = _selected.clamp(0, cats.length - 1);
        return ContentWidth(
          maxWidth: 1180,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final pagePadding = constraints.maxWidth >= 720 ? 28.0 : 12.0;
              return ListView(
                controller: _scrollController,
                padding: EdgeInsets.fromLTRB(pagePadding, 12, pagePadding, 32),
                children: [
                  _HeroBanner(
                    onBrowse: () => _scrollController.animateTo(
                      310,
                      duration: const Duration(milliseconds: 450),
                      curve: Curves.easeOutCubic,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const _LocationBanner(),
                  const SizedBox(height: 24),
                  Text(
                    l.menuFeatured,
                    style: Theme.of(context).textTheme.headlineSmall
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    alignment: WrapAlignment.end,
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (var i = 0; i < cats.length; i++)
                        ChoiceChip(
                          label: Text(cats[i].name(context.lang)),
                          selected: i == index,
                          onSelected: (_) => setState(() => _selected = i),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  LayoutBuilder(
                    builder: (context, gridConstraints) {
                      final twoColumns = gridConstraints.maxWidth >= 680;
                      final gap = twoColumns ? 16.0 : 0.0;
                      final cardWidth = twoColumns
                          ? (gridConstraints.maxWidth - gap) / 2
                          : gridConstraints.maxWidth;
                      return Wrap(
                        spacing: gap,
                        runSpacing: 8,
                        children: [
                          for (final item in cats[index].items)
                            SizedBox(
                              width: cardWidth,
                              child: ItemCard(
                                item: item,
                                onTap: item.isAvailable
                                    ? () => Navigator.of(context).push(
                                        MaterialPageRoute<void>(
                                          builder: (_) =>
                                              CustomizerScreen(item: item),
                                        ),
                                      )
                                    : null,
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ],
              );
            },
          ),
        );
    }
  }
}

class _HeroBanner extends StatelessWidget {
  const _HeroBanner({required this.onBrowse});

  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth >= 920;
        final height = isDesktop
            ? 286.0
            : constraints.maxWidth >= 620
            ? 240.0
            : 212.0;
        final copyWidth = isDesktop ? 420.0 : 280.0;
        return ClipRRect(
          borderRadius: BorderRadius.circular(isDesktop ? 30 : 24),
          child: SizedBox(
            height: height,
            child: Stack(
              fit: StackFit.expand,
              children: [
                ColoredBox(
                  color: AppTheme.deepRed,
                  child: Semantics(
                    label: l.menuHeroTitle,
                    image: true,
                    child: Image.asset(
                      ProductAssets.heroPizza,
                      fit: BoxFit.cover,
                      alignment: Alignment.center,
                    ),
                  ),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: AlignmentDirectional.centerStart,
                      end: AlignmentDirectional.centerEnd,
                      colors: [
                        AppTheme.deepRed.withValues(alpha: 0.94),
                        AppTheme.deepRed.withValues(alpha: 0.54),
                        Colors.transparent,
                      ],
                      stops: const [0, 0.54, 1],
                    ),
                  ),
                ),
                Padding(
                  padding: EdgeInsets.all(isDesktop ? 30 : 20),
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: AlignmentDirectional.centerStart,
                      child: SizedBox(
                        width: copyWidth,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              l.menuHeroEyebrow,
                              style: const TextStyle(
                                color: AppTheme.cheese,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.4,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              l.menuHeroTitle,
                              style: Theme.of(context).textTheme.headlineMedium
                                  ?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w900,
                                    height: 1.05,
                                  ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              l.menuHeroBody,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                height: 1.25,
                              ),
                            ),
                            const SizedBox(height: 10),
                            FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: AppTheme.deepRed,
                                minimumSize: const Size(0, 40),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 18,
                                ),
                              ),
                              onPressed: onBrowse,
                              child: Text(l.menuHeroCta),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _LocationBanner extends StatelessWidget {
  const _LocationBanner();

  Future<void> _open(BuildContext context) async {
    await Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => const LocationScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final location = context.watch<CartNotifier>().location;
    final selected = location != null;
    return Card(
      margin: EdgeInsets.zero,
      color: selected ? const Color(0xFFF0F3E8) : const Color(0xFFFFE9D7),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => _open(context),
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(14, 12, 10, 12),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: selected ? AppTheme.olive : AppTheme.cheese,
                foregroundColor: AppTheme.ink,
                child: Icon(selected ? Icons.check : Icons.my_location),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      selected ? l.menuLocationSet : l.menuLocationTitle,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      selected
                          ? '${location.lat.toStringAsFixed(3)}, ${location.lng.toStringAsFixed(3)}'
                          : l.menuLocationBody,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                onPressed: () => _open(context),
                child: Text(l.menuLocationCta),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ItemCard extends StatelessWidget {
  const ItemCard({super.key, required this.item, this.onTap});

  final MenuItem item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final theme = Theme.of(context);
    final from = item.fromPricePiastres;
    final desc = item.description(context.lang);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Opacity(
          opacity: onTap == null ? 0.55 : 1,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                _Thumb(item: item),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.name(context.lang),
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (desc.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          desc,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            height: 1.25,
                          ),
                        ),
                      ],
                      const SizedBox(height: 8),
                      if (from != null)
                        DecoratedBox(
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(
                              alpha: 0.09,
                            ),
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 5,
                            ),
                            child: Text(
                              l.itemFromPrice(formatMoney(l, from)),
                              style: theme.textTheme.labelLarge?.copyWith(
                                color: theme.colorScheme.primary,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        )
                      else
                        Text(
                          l.itemUnavailable,
                          style: TextStyle(color: theme.colorScheme.error),
                        ),
                    ],
                  ),
                ),
                if (onTap != null)
                  Icon(
                    Icons.arrow_forward_ios_rounded,
                    size: 16,
                    color: theme.colorScheme.primary,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.item});
  final MenuItem item;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: 104,
      height: 104,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Icon(
        item.isPizza ? Icons.local_pizza : Icons.restaurant,
        size: 34,
        color: Theme.of(context).colorScheme.primary,
      ),
    );
    final url = item.imageUrl;
    final image = url == null
        ? ProductAssets.imageOrFallback(
            context: context,
            itemId: item.id,
            fallback: fallback,
            width: 104,
            height: 104,
          )
        : ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Image.network(
              url,
              width: 104,
              height: 104,
              fit: BoxFit.cover,
              excludeFromSemantics: true,
              errorBuilder: (_, _, _) => fallback,
            ),
          );
    return Semantics(label: item.name(context.lang), image: true, child: image);
  }
}
