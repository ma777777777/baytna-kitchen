import type { Aisle, Ingredient } from './types'

type Opts = Omit<Ingredient, 'id' | 'name' | 'aisle'>

const list: Ingredient[] = []
function i(id: string, en: string, ar: string, aisle: Aisle, opts: Opts = {}) {
  list.push({ id, name: { en, ar }, aisle, ...opts })
}

// Produce (khodarji)
i('tomato', 'Tomatoes', 'بندورة', 'produce', { fresh: true, keepsDays: 7, aliases: ['banadoura', 'tomato'] })
i('cherry_tomato', 'Cherry tomatoes', 'بندورة كرزية', 'produce', { fresh: true, keepsDays: 7, subs: ['tomato'] })
i('cucumber', 'Cucumbers', 'خيار', 'produce', { fresh: true, keepsDays: 6, aliases: ['khiyar', 'kh2yar'] })
i('lettuce', 'Lettuce', 'خس', 'produce', { fresh: true, keepsDays: 5, aliases: ['khass'], subs: ['cabbage'] })
i('cabbage', 'White cabbage', 'ملفوف', 'produce', { fresh: true, keepsDays: 14, aliases: ['malfouf'], subs: ['lettuce'] })
i('parsley', 'Parsley', 'بقدونس', 'produce', { fresh: true, keepsDays: 5, aliases: ['ba2dounes', 'baqdounes'] })
i('mint', 'Fresh mint', 'نعنع', 'produce', { fresh: true, keepsDays: 5, aliases: ['na3na3'], subs: ['dried_mint'] })
i('green_onion', 'Spring onions', 'بصل أخضر', 'produce', { fresh: true, keepsDays: 6, aliases: ['basal akhdar'], subs: ['onion'] })
i('onion', 'Onions', 'بصل', 'produce', { keepsDays: 30, aliases: ['basal'] })
i('garlic', 'Garlic', 'ثوم', 'produce', { keepsDays: 30, aliases: ['toum'] })
i('lemon', 'Lemons', 'حامض', 'produce', { fresh: true, keepsDays: 14, aliases: ['hamod', 'laymoun', 'lemon'] })
i('potato', 'Potatoes', 'بطاطا', 'produce', { keepsDays: 21, aliases: ['batata'] })
i('bell_pepper', 'Bell peppers', 'فليفلة حلوة', 'produce', { fresh: true, keepsDays: 7, aliases: ['flayfle', 'capsicum'] })
i('green_pepper', 'Green chili (optional heat)', 'فليفلة حارة', 'produce', { fresh: true, keepsDays: 7 })
i('carrot', 'Carrots', 'جزر', 'produce', { keepsDays: 14, aliases: ['jazar'] })
i('zucchini', 'Zucchini', 'كوسا', 'produce', { fresh: true, keepsDays: 6, aliases: ['kousa', 'courgette'] })
i('eggplant', 'Eggplant', 'باذنجان', 'produce', { fresh: true, keepsDays: 6, aliases: ['batinjen', 'aubergine'] })
i('cauliflower', 'Cauliflower', 'قرنبيط', 'produce', { fresh: true, keepsDays: 7, aliases: ['arnabit', 'zahra'] })
i('green_beans', 'Green beans', 'لوبية', 'produce', { fresh: true, keepsDays: 5, aliases: ['loubieh', 'loubye'], subs: ['frozen_green_beans'] })
i('spinach', 'Spinach', 'سبانخ', 'produce', { fresh: true, keepsDays: 4, aliases: ['sbenegh'], subs: ['frozen_spinach'] })
i('radish', 'Radishes', 'فجل', 'produce', { fresh: true, keepsDays: 7, aliases: ['fijl'] })
i('purslane', 'Purslane (optional)', 'بقلة', 'produce', { fresh: true, keepsDays: 3, aliases: ['ba2le'] })
i('banana', 'Bananas', 'موز', 'produce', { fresh: true, keepsDays: 5, aliases: ['mouz'] })
i('apple', 'Apples', 'تفاح', 'produce', { keepsDays: 21, aliases: ['tiffeh'] })
i('grapes', 'Grapes', 'عنب', 'produce', { fresh: true, keepsDays: 5, aliases: ['3enab'] })
i('orange', 'Oranges', 'ليمون (برتقال)', 'produce', { keepsDays: 14, aliases: ['laymoun', 'burd2an', 'orange'] })
i('seasonal_fruit', 'Seasonal fruit', 'فاكهة الموسم', 'produce', { fresh: true, keepsDays: 5 })

// Butcher / fish (lahham, samak)
i('chicken_breast', 'Chicken breast', 'صدر دجاج', 'butcher', { raw: 'poultry', keepsDays: 2, aliases: ['djej', 'jej', 'chicken'], subs: ['chicken_thigh'] })
i('chicken_thigh', 'Boneless chicken thighs', 'فخاد دجاج بلا عضم', 'butcher', { raw: 'poultry', keepsDays: 2, aliases: ['djej'], subs: ['chicken_breast'] })
i('minced_beef', 'Lean minced beef', 'لحمة مفرومة', 'butcher', { raw: 'minced', keepsDays: 2, aliases: ['la7me mafrume', 'kafta'], subs: ['minced_chicken'] })
i('minced_chicken', 'Minced chicken or turkey', 'دجاج مفروم', 'butcher', { raw: 'minced', keepsDays: 2, subs: ['minced_beef'] })
i('kafta_mix', 'Kafta mix (ready from butcher)', 'كفتة جاهزة', 'butcher', { raw: 'minced', keepsDays: 1, aliases: ['kafta'], subs: ['minced_beef'] })
i('white_fish', 'White fish fillets', 'فيليه سمك أبيض', 'butcher', { raw: 'fish', keepsDays: 1, allergens: ['fish'], aliases: ['samak', 'sultan ibrahim', 'loukos'], subs: ['frozen_fish'] })

// Dairy & eggs
i('eggs', 'Eggs', 'بيض', 'dairy', { keepsDays: 21, allergens: ['egg'], aliases: ['bayd', 'beid'] })
i('labneh', 'Labneh', 'لبنة', 'dairy', { keepsDays: 10, allergens: ['dairy'], aliases: ['labne', 'labni'] })
i('yogurt', 'Plain yogurt (laban)', 'لبن', 'dairy', { keepsDays: 10, allergens: ['dairy'], aliases: ['laban', 'yoghurt', 'zabadi'], subs: ['labneh'] })
i('milk', 'Milk', 'حليب', 'dairy', { keepsDays: 6, allergens: ['dairy'], aliases: ['7aleeb', 'haleeb'], subs: ['plant_milk'] })
i('plant_milk', 'Plant milk (oat/almond/soy)', 'حليب نباتي', 'dairy', { keepsDays: 7, subs: ['milk'] })
i('white_cheese', 'White cheese (akkawi/halloumi/feta)', 'جبنة بيضا', 'dairy', { keepsDays: 10, allergens: ['dairy'], aliases: ['jibne', 'akkawi', 'halloum', 'baladi'] })
i('cottage_cheese', 'Cottage cheese', 'جبنة قريش', 'dairy', { keepsDays: 7, allergens: ['dairy'], subs: ['yogurt'] })
i('butter', 'Butter', 'زبدة', 'dairy', { keepsDays: 30, allergens: ['dairy'], subs: ['olive_oil'] })

// Bakery
i('pita', 'Arabic bread (pita)', 'خبز عربي', 'bakery', { keepsDays: 3, allergens: ['gluten'], aliases: ['khebez', 'kheb', 'markouk'] })
i('ww_pita', 'Whole-wheat Arabic bread', 'خبز أسمر', 'bakery', { keepsDays: 3, allergens: ['gluten'], aliases: ['khebez asmar', 'brown bread'], subs: ['pita'] })
i('toast', 'Whole-grain toast bread', 'خبز توست أسمر', 'bakery', { keepsDays: 5, allergens: ['gluten'], subs: ['ww_pita'] })
i('tortilla', 'Large wraps / saj bread', 'خبز صاج أو تورتيلا', 'bakery', { keepsDays: 5, allergens: ['gluten'], aliases: ['saj', 'markouk'], subs: ['pita'] })

// Pantry (mouneh)
i('olive_oil', 'Olive oil', 'زيت زيتون', 'pantry', { keepsDays: 365, aliases: ['zeit'] })
i('veg_oil', 'Cooking oil', 'زيت نباتي', 'pantry', { keepsDays: 365, subs: ['olive_oil'] })
i('tahini', 'Tahini', 'طحينة', 'pantry', { keepsDays: 180, allergens: ['sesame'], aliases: ['tahina', 'ta7ini'] })
i('red_lentils', 'Red lentils', 'عدس أحمر (مجروش)', 'pantry', { keepsDays: 365, aliases: ['3adas', 'adas'] })
i('brown_lentils', 'Brown lentils', 'عدس بني (حب)', 'pantry', { keepsDays: 365, aliases: ['3adas', 'adas'] })
i('canned_chickpeas', 'Canned chickpeas', 'حمص معلب', 'pantry', { keepsDays: 365, aliases: ['7ommos', 'hummus habb'] })
i('canned_fava', 'Canned fava beans (foul)', 'فول معلب', 'pantry', { keepsDays: 365, aliases: ['foul', 'fool', 'ful'] })
i('canned_white_beans', 'Canned white beans', 'فاصوليا بيضا معلبة', 'pantry', { keepsDays: 365, aliases: ['fasoulia'], subs: ['canned_chickpeas'] })
i('canned_tuna', 'Canned tuna (in water or oil)', 'تونة معلبة', 'pantry', { keepsDays: 365, allergens: ['fish'], aliases: ['tuna', 'tonn'] })
i('canned_tomato', 'Canned chopped tomatoes', 'بندورة معلبة', 'pantry', { keepsDays: 365, subs: ['tomato'] })
i('tomato_paste', 'Tomato paste', 'رب البندورة', 'pantry', { keepsDays: 60, aliases: ['rub banadoura', 'tomato paste'] })
i('hummus_ready', 'Hummus (ready or homemade)', 'حمص بطحينة', 'pantry', { keepsDays: 5, allergens: ['sesame'], aliases: ['hommos', 'hummus'] })
i('rice', 'Rice (or brown rice)', 'رز', 'pantry', { keepsDays: 365, aliases: ['riz', 'roz'] })
i('fine_bulgur', 'Fine bulgur', 'برغل ناعم', 'pantry', { keepsDays: 365, allergens: ['gluten'], aliases: ['burghul', 'borghol'] })
i('coarse_bulgur', 'Coarse bulgur', 'برغل خشن', 'pantry', { keepsDays: 365, allergens: ['gluten'], aliases: ['burghul', 'borghol'], subs: ['rice'] })
i('freekeh', 'Freekeh', 'فريكة', 'pantry', { keepsDays: 365, allergens: ['gluten'], aliases: ['frikeh'], subs: ['coarse_bulgur'] })
i('pasta', 'Pasta (whole-wheat if you like)', 'معكرونة', 'pantry', { keepsDays: 365, allergens: ['gluten'], aliases: ['ma3karone', 'spaghetti'] })
i('vermicelli', 'Vermicelli (shi\'riyeh)', 'شعيرية', 'pantry', { keepsDays: 365, allergens: ['gluten'], aliases: ['sh3riye'] })
i('oats', 'Rolled oats', 'شوفان', 'pantry', { keepsDays: 365, allergens: ['gluten'], aliases: ['shoufan', 'oatmeal'] })
i('peanut_butter', 'Peanut butter', 'زبدة فول سوداني', 'pantry', { keepsDays: 180, allergens: ['peanut'], subs: ['tahini'] })
i('popcorn', 'Popcorn kernels', 'ذرة للفشار', 'snacks', { keepsDays: 365, aliases: ['bouchar', 'pop corn'] })
i('walnuts', 'Walnuts (unsalted)', 'جوز', 'snacks', { keepsDays: 90, allergens: ['tree_nut'], aliases: ['jouz'] })
i('almonds', 'Almonds (unsalted)', 'لوز', 'snacks', { keepsDays: 90, allergens: ['tree_nut'], aliases: ['louz'] })
i('mixed_nuts', 'Unsalted mixed nuts', 'مكسرات غير مملحة', 'snacks', { keepsDays: 90, allergens: ['tree_nut'], aliases: ['mkassarat'] })
i('olives', 'Olives', 'زيتون', 'pantry', { keepsDays: 60, aliases: ['zeitoun'] })
i('honey', 'Honey (optional)', 'عسل', 'pantry', { keepsDays: 365, aliases: ['3asal'] })
i('cocoa', 'Unsweetened cocoa', 'كاكاو', 'pantry', { keepsDays: 365 })
i('pomegranate_molasses', 'Pomegranate molasses', 'دبس رمان', 'pantry', { keepsDays: 365, aliases: ['dibs remmen'] })
i('sumac', 'Sumac', 'سماق', 'pantry', { basic: true, aliases: ['sumac', 'summa2'] })
i('zaatar', "Za'atar", 'زعتر', 'pantry', { keepsDays: 180, allergens: ['sesame'], aliases: ['zaatar', 'za3tar'] })
i('dried_mint', 'Dried mint', 'نعنع يابس', 'pantry', { basic: true })
i('cumin', 'Ground cumin', 'كمون', 'pantry', { basic: true, aliases: ['kammoun'] })
i('seven_spice', 'Seven spices (baharat)', 'سبع بهارات', 'pantry', { basic: true, aliases: ['baharat', '7 spices'] })
i('paprika', 'Paprika', 'بابريكا', 'pantry', { basic: true })
i('cinnamon', 'Cinnamon', 'قرفة', 'pantry', { basic: true, aliases: ['erfe'] })
i('coriander_ground', 'Ground coriander', 'كزبرة يابسة', 'pantry', { basic: true })
i('salt', 'Salt', 'ملح', 'pantry', { basic: true })
i('black_pepper', 'Black pepper', 'بهار أسود', 'pantry', { basic: true })
i('chili_flakes', 'Chili flakes', 'فلفل أحمر مجروش', 'pantry', { basic: true })
i('vinegar', 'Vinegar', 'خل', 'pantry', { basic: true })
i('stock_cube', 'Stock cube (optional)', 'مكعب مرق', 'pantry', { basic: true })
i('water', 'Water', 'مي', 'pantry', { free: true })

// Freezer
i('frozen_veg', 'Frozen mixed vegetables', 'خضار مشكلة مثلجة', 'frozen', { keepsDays: 180 })
i('frozen_peas_carrots', 'Frozen peas & carrots', 'بازيلا وجزر مثلج', 'frozen', { keepsDays: 180, aliases: ['bazella'] })
i('frozen_spinach', 'Frozen spinach', 'سبانخ مثلجة', 'frozen', { keepsDays: 180, subs: ['spinach'] })
i('frozen_green_beans', 'Frozen green beans', 'لوبية مثلجة', 'frozen', { keepsDays: 180, subs: ['green_beans'] })
i('frozen_fish', 'Frozen white fish fillets', 'فيليه سمك مثلج', 'frozen', { keepsDays: 180, allergens: ['fish'], raw: 'fish', subs: ['white_fish'] })
i('frozen_strawberries', 'Frozen strawberries', 'فريز مثلج', 'frozen', { keepsDays: 180, aliases: ['frez', 'fraise'] })
i('frozen_berries', 'Frozen mixed berries', 'توت مشكل مثلج', 'frozen', { keepsDays: 180, subs: ['frozen_strawberries'] })
i('frozen_mango', 'Frozen mango', 'منغا مثلجة', 'frozen', { keepsDays: 180, subs: ['banana'] })

export const INGREDIENTS: Record<string, Ingredient> = Object.fromEntries(list.map((x) => [x.id, x]))

export function ingredient(id: string): Ingredient {
  const found = INGREDIENTS[id]
  if (!found) throw new Error(`Unknown ingredient: ${id}`)
  return found
}

/** Default "always have at home" staples. Users can add or remove any. */
export const DEFAULT_STAPLES = [
  'eggs', 'labneh', 'yogurt', 'cucumber', 'tomato', 'lemon', 'onion', 'garlic', 'pita',
  'canned_chickpeas', 'canned_fava', 'red_lentils', 'oats', 'rice', 'coarse_bulgur', 'olive_oil',
  'tahini', 'canned_tuna', 'frozen_veg', 'frozen_strawberries', 'banana', 'pasta', 'zaatar',
]

export const AISLE_ORDER: string[] = ['produce', 'butcher', 'dairy', 'bakery', 'pantry', 'frozen', 'snacks', 'other']
