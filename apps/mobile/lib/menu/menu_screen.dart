import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/models/menu_models.dart';
import '../l10n/l10n.dart';
import '../theme/common_widgets.dart';
import 'customizer_screen.dart';
import 'menu_notifier.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  int _selected = 0;

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
          child: Column(
            children: [
              SizedBox(
                height: 56,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  itemCount: cats.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => ChoiceChip(
                    label: Text(cats[i].name(context.lang)),
                    selected: i == index,
                    onSelected: (_) => setState(() => _selected = i),
                  ),
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
                  children: [
                    for (final item in cats[index].items)
                      ItemCard(
                        item: item,
                        onTap: item.isAvailable
                            ? () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                  builder: (_) => CustomizerScreen(item: item),
                                ),
                              )
                            : null,
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
    }
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
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Opacity(
          opacity: onTap == null ? 0.55 : 1,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                _Thumb(item: item),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.name(context.lang),
                        style: theme.textTheme.titleMedium,
                      ),
                      if (desc.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          desc,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                      const SizedBox(height: 6),
                      Text(
                        from == null
                            ? l.itemUnavailable
                            : l.itemFromPrice(formatMoney(l, from)),
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: from == null
                              ? theme.colorScheme.error
                              : theme.colorScheme.primary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (onTap != null) const Icon(Icons.chevron_right),
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
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(
        item.isPizza ? Icons.local_pizza : Icons.restaurant,
        color: Theme.of(context).colorScheme.primary,
      ),
    );
    final url = item.imageUrl;
    if (url == null) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.network(
        url,
        width: 64,
        height: 64,
        fit: BoxFit.cover,
        excludeFromSemantics: true,
        errorBuilder: (_, _, _) => fallback,
      ),
    );
  }
}
